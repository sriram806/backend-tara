export class SkillNormalizationService {
  /**
   * Canonical mapping for common skill aliases.
   */
  public static readonly SYNONYMS: Record<string, string> = {

    // =========================
    // Programming Languages
    // =========================
    'js': 'JavaScript',
    'javascript': 'JavaScript',
    'ts': 'TypeScript',
    'typescript': 'TypeScript',
    'py': 'Python',
    'python': 'Python',
    'python3': 'Python',
    'cpp': 'C++',
    'c++': 'C++',
    'c plus plus': 'C++',
    'c': 'C',
    'csharp': 'C#',
    'c#': 'C#',
    'dotnet': '.NET',
    'go': 'Go',
    'golang': 'Go',
    'rust': 'Rust',
    'swift': 'Swift',
    'kotlin': 'Kotlin',
    'scala': 'Scala',
    'r': 'R',
    'matlab': 'MATLAB',

    // =========================
    // Web Development
    // =========================
    'react': 'React',
    'reactjs': 'React',
    'react js': 'React',
    'next': 'NextJS',
    'nextjs': 'NextJS',
    'next js': 'NextJS',
    'vue': 'Vue',
    'vuejs': 'Vue',
    'angular': 'Angular',
    'angularjs': 'Angular',
    'express': 'Express',
    'expressjs': 'Express',
    'nestjs': 'NestJS',
    'html': 'HTML',
    'html5': 'HTML',
    'css': 'CSS',
    'css3': 'CSS',
    'tailwind': 'Tailwind CSS',
    'bootstrap': 'Bootstrap',

    // =========================
    // Backend
    // =========================
    'node': 'NodeJS',
    'nodejs': 'NodeJS',
    'node js': 'NodeJS',
    'springboot': 'Spring Boot',
    'spring': 'Spring Framework',
    'django': 'Django',
    'flask': 'Flask',
    'fastapi': 'FastAPI',
    'laravel': 'Laravel',
    'rails': 'Ruby on Rails',

    // =========================
    // Databases
    // =========================
    'mongo': 'MongoDB',
    'mongodb': 'MongoDB',
    'mysql': 'MySQL',
    'postgres': 'PostgreSQL',
    'postgresql': 'PostgreSQL',
    'sqlite': 'SQLite',
    'redis': 'Redis',
    'firebase': 'Firebase',
    'supabase': 'Supabase',

    // =========================
    // DevOps / Cloud
    // =========================
    'aws': 'Amazon Web Services',
    'gcp': 'Google Cloud Platform',
    'azure': 'Microsoft Azure',
    'docker': 'Docker',
    'k8s': 'Kubernetes',
    'kubernetes': 'Kubernetes',
    'jenkins': 'Jenkins',
    'github actions': 'GitHub Actions',
    'ci cd': 'CI/CD',
    'terraform': 'Terraform',
    'ansible': 'Ansible',
    'nginx': 'Nginx',

    // =========================
    // Mobile
    // =========================
    'android': 'Android Development',
    'ios': 'iOS Development',
    'react native': 'React Native',
    'flutter': 'Flutter',
    'dart': 'Dart',

    // =========================
    // AI / ML
    // =========================
    'ai': 'Artificial Intelligence',
    'ml': 'Machine Learning',
    'dl': 'Deep Learning',
    'nlp': 'Natural Language Processing',
    'cv': 'Computer Vision',
    'pandas': 'Pandas',
    'numpy': 'NumPy',
    'tensorflow': 'TensorFlow',
    'pytorch': 'PyTorch',
    'sklearn': 'Scikit-learn',

    // =========================
    // GenAI
    // =========================
    'gpt': 'LLMs',
    'llm': 'Large Language Models',
    'openai': 'OpenAI API',
    'langchain': 'LangChain',
    'rag': 'Retrieval-Augmented Generation',
    'prompt engineering': 'Prompt Engineering',

    // =========================
    // Cybersecurity
    // =========================
    'cyber security': 'Cybersecurity',
    'ethical hacking': 'Ethical Hacking',
    'pentest': 'Penetration Testing',

    // =========================
    // Core CS
    // =========================
    'dsa': 'Data Structures and Algorithms',
    'oop': 'Object-Oriented Programming',
    'os': 'Operating Systems',
    'dbms': 'Database Management Systems',

    // =========================
    // Tools
    // =========================
    'git': 'Git',
    'github': 'GitHub',
    'jira': 'Jira',
    'postman': 'Postman',
    'linux': 'Linux',

    // =========================
    // Testing
    // =========================
    'jest': 'Jest',
    'selenium': 'Selenium',
    'cypress': 'Cypress',
  };

  /**
   * Stack detection (VERY IMPORTANT)
   */
  private static readonly STACKS: Record<string, string[]> = {
    'mern': ['MongoDB', 'Express', 'React', 'NodeJS'],
    'mean': ['MongoDB', 'Express', 'Angular', 'NodeJS'],
    'lamp': ['Linux', 'Apache', 'MySQL', 'PHP'],
  };

  /**
   * Normalize text
   */
  private static clean(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Normalize single skill
   */
  public static normalize(input: string): string {
    if (!input) return '';

    const clean = this.clean(input);

    if (this.SYNONYMS[clean]) {
      return this.SYNONYMS[clean];
    }

    return clean
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  /**
   * Extract multiple skills from sentence
   */
  public static extractSkills(text: string): string[] {
    const clean = this.clean(text);
    const tokens = clean.split(' ');

    const result = new Set<string>();

    // check stacks first
    Object.keys(this.STACKS).forEach(stack => {
      if (clean.includes(stack)) {
        this.STACKS[stack].forEach(s => result.add(s));
      }
    });

    // token match
    tokens.forEach(token => {
      if (this.SYNONYMS[token]) {
        result.add(this.SYNONYMS[token]);
      }
    });

    return Array.from(result);
  }

  /**
   * Slug generator
   */
  public static toSlug(input: string): string {
    return this.normalize(input)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}