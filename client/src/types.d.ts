// Type declarations for modules without @types packages

declare module 'react-pdf' {
  import { ComponentType, ReactNode } from 'react';

  interface DocumentProps {
    file?: string | File | null;
    onLoadSuccess?: (pdf: { numPages: number }) => void;
    onLoadError?: (error: Error) => void;
    loading?: ReactNode;
    children?: ReactNode;
    className?: string;
  }

  interface PageProps {
    pageNumber: number;
    width?: number;
    scale?: number;
    onRenderSuccess?: () => void;
    onRenderError?: (error: Error) => void;
    className?: string;
  }

  export const Document: ComponentType<DocumentProps>;
  export const Page: ComponentType<PageProps>;
  export const pdfjs: {
    GlobalWorkerOptions: {
      workerSrc: string;
    };
    version: string;
  };
}
