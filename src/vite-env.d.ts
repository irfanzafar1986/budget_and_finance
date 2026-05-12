/// <reference types="vite/client" />

declare module '*.sql?raw' {
  const content: string;
  export default content;
}

declare module '*.css';

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
