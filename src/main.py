class Solution:

# invocations[i] = [ai, bi] means ai invokes bi
    def remainingMethods(self, n: int, k: int, invocations: list[list[int]]) -> list[int]:
        g: list[list[int]] = [[] for _ in range(n)]

        for x, y in invocations:
            g[x].append(y) # x invokes y

        bad_fn: set[int] = set()


        # Collect all bad functions
        def dfs(x: int) -> None:
            bad_fn.add(x)
            for y in g[x]: # x invokes y
                if y not in bad_fn:
                    dfs(y)

        dfs(k)

        for x, y in invocations:
            if x not in bad_fn and y in bad_fn: # x invokes y
                return list(range(n))

        return list(set(range(n)) - bad_fn)
