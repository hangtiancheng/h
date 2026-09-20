export interface Headers {
  edu: string;
  skills: string;
  works: string;
  projects: string;
  research: string;
}

// Locale-aware UI chrome labels (contact chips, language toggle button)
export interface Labels {
  tel: string;
  email: string;
  github: string;
  switch: string;
}

export interface TitledItem {
  title: string;
  content: string;
}

export interface Resume {
  headers: Headers;
  labels: Labels;
  name: string;
  tel: string;
  email: string;
  github: string;
  about: string;
  edu: string[][];
  skills: string[];
  works: TitledItem[];
  projects: TitledItem[];
  research: string;
}
