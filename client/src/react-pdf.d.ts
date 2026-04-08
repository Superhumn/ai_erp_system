declare module 'react-pdf' {
  import { ComponentType, ReactNode } from 'react';

  interface DocumentProps {
    file: string | { url: string } | ArrayBuffer | null;
    onLoadSuccess?: (data: { numPages: number }) => void;
    onLoadError?: (error: Error) => void;
    loading?: ReactNode;
    error?: ReactNode;
    children?: ReactNode;
  }

  interface PageProps {
    pageNumber: number;
    scale?: number;
    rotate?: number;
    width?: number;
    height?: number;
    loading?: ReactNode;
    renderTextLayer?: boolean;
    renderAnnotationLayer?: boolean;
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
