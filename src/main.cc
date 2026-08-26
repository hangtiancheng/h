// Express-style HTTP server in modern C++17.
//
// Features:
//   - Route registration: app.get/post/put/del/patch/all
//   - Middleware chain via app.use()
//   - Path parameters ("/users/:id") and wildcard segments
//   - Query-string parsing ("?a=1&b=2")
//   - Request body reading with Content-Length
//   - Response helpers: status(), set(), send(), json(), html(), end()
//   - Thread-per-connection concurrency
//   - Graceful 404 / 405 / 500 handling
//
// Build:
//   clang++ -std=c++17 -O2 -pthread main.cc -o server
//
// Run:
//   ./server            # listens on 0.0.0.0:3000

#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstring>
#include <functional>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <thread>
#include <unordered_set>
#include <vector>

namespace express {

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

inline std::string to_lower(std::string s) {
  std::transform(s.begin(), s.end(), s.begin(),
                 [](unsigned char c) { return std::tolower(c); });
  return s;
}

inline std::string trim(const std::string &s) {
  size_t b = s.find_first_not_of(" \t\r\n");
  if (b == std::string::npos)
    return "";
  size_t e = s.find_last_not_of(" \t\r\n");
  return s.substr(b, e - b + 1);
}

inline std::vector<std::string> split(const std::string &s, char delim) {
  std::vector<std::string> out;
  std::string cur;
  std::istringstream ss(s);
  while (std::getline(ss, cur, delim))
    out.push_back(cur);
  return out;
}

inline std::string url_decode(const std::string &s) {
  std::string out;
  out.reserve(s.size());
  for (size_t i = 0; i < s.size(); ++i) {
    if (s[i] == '%' && i + 2 < s.size()) {
      int v = 0;
      std::istringstream ss(s.substr(i + 1, 2));
      if (ss >> std::hex >> v) {
        out.push_back(static_cast<char>(v));
        i += 2;
        continue;
      }
    } else if (s[i] == '+') {
      out.push_back(' ');
      continue;
    }
    out.push_back(s[i]);
  }
  return out;
}

inline std::string json_escape(const std::string &s) {
  std::string out;
  out.reserve(s.size() + 8);
  for (char c : s) {
    switch (c) {
    case '"':
      out += "\\\"";
      break;
    case '\\':
      out += "\\\\";
      break;
    case '\n':
      out += "\\n";
      break;
    case '\r':
      out += "\\r";
      break;
    case '\t':
      out += "\\t";
      break;
    default:
      if (static_cast<unsigned char>(c) < 0x20) {
        char buf[8];
        std::snprintf(buf, sizeof(buf), "\\u%04x", c);
        out += buf;
      } else {
        out.push_back(c);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Request / Response
// ---------------------------------------------------------------------------

struct Request {
  std::string method;
  std::string path;                           // decoded path, no query
  std::string raw_url;                        // original request target
  std::map<std::string, std::string> headers; // lower-cased keys
  std::map<std::string, std::string> query;   // parsed query params
  std::map<std::string, std::string> params;  // route path params
  std::string body;                           // raw request body

  std::string header(const std::string &name,
                     const std::string &def = "") const {
    auto it = headers.find(to_lower(name));
    return it == headers.end() ? def : it->second;
  }
  std::string param(const std::string &name,
                    const std::string &def = "") const {
    auto it = params.find(name);
    return it == params.end() ? def : it->second;
  }
  std::string get_query(const std::string &name,
                        const std::string &def = "") const {
    auto it = query.find(name);
    return it == query.end() ? def : it->second;
  }
};

class Response {
public:
  explicit Response(int fd) : fd_(fd) {}

  Response &status(int code) {
    status_ = code;
    return *this;
  }

  Response &set(const std::string &name, const std::string &value) {
    headers_[name] = value;
    return *this;
  }

  Response &type(const std::string &mime) { return set("Content-Type", mime); }

  void send(const std::string &body) {
    if (!headers_.count("Content-Type"))
      set("Content-Type", "text/plain; charset=utf-8");
    finish(body);
  }

  void html(const std::string &body) {
    set("Content-Type", "text/html; charset=utf-8");
    finish(body);
  }

  // Serialize a map as a flat JSON object of string values.
  void json(const std::map<std::string, std::string> &obj) {
    std::ostringstream ss;
    ss << "{";
    bool first = true;
    for (const auto &kv : obj) {
      if (!first)
        ss << ",";
      first = false;
      ss << "\"" << json_escape(kv.first) << "\":\"" << json_escape(kv.second)
         << "\"";
    }
    ss << "}";
    set("Content-Type", "application/json; charset=utf-8");
    finish(ss.str());
  }

  void end() { finish(""); }

  bool finished() const { return finished_; }

private:
  void finish(const std::string &body) {
    if (finished_)
      return;
    finished_ = true;

    std::ostringstream head;
    head << "HTTP/1.1 " << status_ << " " << reason(status_) << "\r\n";
    if (!headers_.count("Content-Type"))
      headers_["Content-Type"] = "text/plain; charset=utf-8";
    headers_["Content-Length"] = std::to_string(body.size());
    if (!headers_.count("Connection"))
      headers_["Connection"] = "close";
    for (const auto &kv : headers_)
      head << kv.first << ": " << kv.second << "\r\n";
    head << "\r\n";

    std::string out = head.str() + body;
    size_t sent = 0;
    while (sent < out.size()) {
      ssize_t n = ::send(fd_, out.data() + sent, out.size() - sent, 0);
      if (n <= 0)
        break;
      sent += static_cast<size_t>(n);
    }
  }

  static const char *reason(int code) {
    switch (code) {
    case 200:
      return "OK";
    case 201:
      return "Created";
    case 204:
      return "No Content";
    case 301:
      return "Moved Permanently";
    case 302:
      return "Found";
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 405:
      return "Method Not Allowed";
    case 500:
      return "Internal Server Error";
    default:
      return "OK";
    }
  }

  int fd_;
  int status_ = 200;
  std::map<std::string, std::string> headers_;
  bool finished_ = false;
};

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

using Handler = std::function<void(Request &, Response &)>;
using Next = std::function<void()>;
using Middleware = std::function<void(Request &, Response &, Next)>;

struct Route {
  std::string method;                // upper-case, or "*" for all
  std::vector<std::string> segments; // path split by '/'
  Handler handler;
};

class App {
public:
  void use(Middleware mw) { middlewares_.push_back(std::move(mw)); }

  // A plain handler registered with use() runs on every request.
  void use(Handler h) {
    middlewares_.push_back([h](Request &req, Response &res, Next next) {
      h(req, res);
      if (!res.finished())
        next();
    });
  }

  void get(const std::string &p, Handler h) { add("GET", p, std::move(h)); }
  void post(const std::string &p, Handler h) { add("POST", p, std::move(h)); }
  void put(const std::string &p, Handler h) { add("PUT", p, std::move(h)); }
  void del(const std::string &p, Handler h) { add("DELETE", p, std::move(h)); }
  void patch(const std::string &p, Handler h) { add("PATCH", p, std::move(h)); }
  void all(const std::string &p, Handler h) { add("*", p, std::move(h)); }

  void listen(int port) {
    int srv = ::socket(AF_INET, SOCK_STREAM, 0);
    if (srv < 0) {
      std::perror("socket");
      return;
    }

    int opt = 1;
    ::setsockopt(srv, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(static_cast<uint16_t>(port));

    if (::bind(srv, reinterpret_cast<sockaddr *>(&addr), sizeof(addr)) < 0) {
      std::perror("bind");
      ::close(srv);
      return;
    }
    if (::listen(srv, 128) < 0) {
      std::perror("listen");
      ::close(srv);
      return;
    }

    std::cout << "Server listening on http://0.0.0.0:" << port << "\n";

    while (true) {
      sockaddr_in cli{};
      socklen_t len = sizeof(cli);
      int fd = ::accept(srv, reinterpret_cast<sockaddr *>(&cli), &len);
      if (fd < 0)
        continue;
      std::thread([this, fd] { handle(fd); }).detach();
    }
  }

private:
  void add(const std::string &method, const std::string &path, Handler h) {
    Route r;
    r.method = method;
    r.segments = split_path(path);
    r.handler = std::move(h);
    routes_.push_back(std::move(r));
  }

  static std::vector<std::string> split_path(const std::string &path) {
    std::vector<std::string> segs;
    for (const auto &s : split(path, '/'))
      if (!s.empty())
        segs.push_back(s);
    return segs;
  }

  // Match a route pattern against a request path. Fills params on success.
  // ":name" captures a segment; "*" matches the rest of the path.
  static bool match(const Route &r, const std::vector<std::string> &parts,
                    std::map<std::string, std::string> &params) {
    size_t i = 0;
    for (; i < r.segments.size(); ++i) {
      const std::string &seg = r.segments[i];
      if (seg == "*")
        return true;
      if (i >= parts.size())
        return false;
      if (!seg.empty() && seg[0] == ':') {
        params[seg.substr(1)] = url_decode(parts[i]);
      } else if (seg != parts[i]) {
        return false;
      }
    }
    return i == parts.size();
  }

  void handle(int fd) {
    Request req;
    if (!read_request(fd, req)) {
      ::close(fd);
      return;
    }

    Response res(fd);
    try {
      dispatch(req, res);
    } catch (const std::exception &e) {
      if (!res.finished())
        res.status(500).send(std::string("Internal Server Error: ") + e.what());
    } catch (...) {
      if (!res.finished())
        res.status(500).send("Internal Server Error");
    }
    ::close(fd);
  }

  void dispatch(Request &req, Response &res) {
    auto parts = split_path(req.path);

    std::vector<Middleware> chain = middlewares_;

    bool matched = false;
    bool method_mismatch = false;
    for (const auto &r : routes_) {
      std::map<std::string, std::string> params;
      if (match(r, parts, params)) {
        if (r.method != "*" && r.method != req.method) {
          method_mismatch = true;
          continue;
        }
        matched = true;
        req.params = params;
        Handler h = r.handler;
        chain.push_back([h](Request &q, Response &s, Next) { h(q, s); });
        break;
      }
    }

    if (!matched) {
      if (method_mismatch) {
        chain.push_back([](Request &, Response &s, Next) {
          s.status(405).send("Method Not Allowed");
        });
      } else {
        chain.push_back([](Request &q, Response &s, Next) {
          s.status(404).send("Cannot " + q.method + " " + q.path);
        });
      }
    }

    std::function<void(size_t)> run = [&](size_t idx) {
      if (idx >= chain.size() || res.finished())
        return;
      chain[idx](req, res, [&run, idx] { run(idx + 1); });
    };
    run(0);

    if (!res.finished())
      res.end();
  }

  // Read and parse a full HTTP request from the socket.
  static bool read_request(int fd, Request &req) {
    std::string buf;
    char tmp[4096];
    size_t header_end = std::string::npos;

    while (header_end == std::string::npos) {
      ssize_t n = ::recv(fd, tmp, sizeof(tmp), 0);
      if (n <= 0)
        return false;
      buf.append(tmp, static_cast<size_t>(n));
      header_end = buf.find("\r\n\r\n");
      if (buf.size() > (1u << 20))
        return false; // header too large
    }

    std::string head = buf.substr(0, header_end);
    std::string rest = buf.substr(header_end + 4);

    auto lines = split(head, '\n');
    if (lines.empty())
      return false;

    // Request line: "GET /path?x=1 HTTP/1.1"
    auto rl = split(trim(lines[0]), ' ');
    if (rl.size() < 2)
      return false;
    req.method = to_lower(rl[0]);
    std::transform(req.method.begin(), req.method.end(), req.method.begin(),
                   ::toupper);
    req.raw_url = rl[1];

    auto qpos = req.raw_url.find('?');
    std::string path_part =
        qpos == std::string::npos ? req.raw_url : req.raw_url.substr(0, qpos);
    req.path = url_decode(path_part);

    if (qpos != std::string::npos) {
      for (const auto &kv : split(req.raw_url.substr(qpos + 1), '&')) {
        if (kv.empty())
          continue;
        auto eq = kv.find('=');
        if (eq == std::string::npos) {
          req.query[url_decode(kv)] = "";
        } else {
          req.query[url_decode(kv.substr(0, eq))] =
              url_decode(kv.substr(eq + 1));
        }
      }
    }

    for (size_t i = 1; i < lines.size(); ++i) {
      auto line = trim(lines[i]);
      auto colon = line.find(':');
      if (colon == std::string::npos)
        continue;
      std::string key = to_lower(trim(line.substr(0, colon)));
      std::string val = trim(line.substr(colon + 1));
      req.headers[key] = val;
    }

    size_t content_length = 0;
    auto cl = req.headers.find("content-length");
    if (cl != req.headers.end()) {
      try {
        content_length = std::stoul(cl->second);
      } catch (...) {
      }
    }
    req.body = rest;
    while (req.body.size() < content_length) {
      ssize_t n = ::recv(fd, tmp, sizeof(tmp), 0);
      if (n <= 0)
        break;
      req.body.append(tmp, static_cast<size_t>(n));
    }
    if (req.body.size() > content_length)
      req.body.resize(content_length);

    return true;
  }

  std::vector<Route> routes_;
  std::vector<Middleware> middlewares_;
};

} // namespace express

// ---------------------------------------------------------------------------
// Demo application
// ---------------------------------------------------------------------------

int main() {
  using express::App;
  using express::Request;
  using express::Response;

  App app;

  // Logging middleware — runs on every request, then calls next().
  app.use([](Request &req, Response &, express::Next next) {
    std::cout << "[req] " << req.method << " " << req.raw_url << "\n";
    next();
  });

  // GET /
  app.get("/", [](Request &, Response &res) {
    res.html("<h1>Express-style C++ server</h1>"
             "<p>Try <code>/hello/world</code> or <code>/users/42</code>.</p>");
  });

  // GET /hello/:name — path parameter
  app.get("/hello/:name", [](Request &req, Response &res) {
    res.json({{"message", "Hello, " + req.param("name") + "!"}});
  });

  // GET /users/:id — path parameter + query string
  app.get("/users/:id", [](Request &req, Response &res) {
    res.json({{"id", req.param("id")},
              {"verbose", req.get_query("verbose", "false")}});
  });

  // POST /echo — reads the request body
  app.post("/echo", [](Request &req, Response &res) {
    res.set("Content-Type", req.header("content-type", "text/plain"))
        .status(201)
        .send(req.body);
  });

  app.listen(3000);
  return 0;
}

class Solution {
public:
  int missingMultiple(std::vector<int> &nums, int k) {
    auto s = std::unordered_set<int>{nums.begin(), nums.end()};
    auto i = 1;
    while (true) {
      if (s.find(i * k) != s.end()) {
        i++;
      } else {
        break;
      }
    }
    return i * k;
  }
};
