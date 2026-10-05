"use client";

// Token warna & animasi yang dipakai bersama oleh halaman admin dan host
// (bg-panel, border-line, accent-*, animate-fadeIn, efek kilau).
export default function AdminThemeStyles() {
  return (
    <style jsx global>{`
      :root {
        --bg-base: #0a0b0e;
        --bg-panel: #111318;
        --border-line: #23262e;
        --accent-400: #7c96ff;
        --accent-500: #5b7fff;
      }
      .bg-base {
        background-color: var(--bg-base);
      }
      .bg-panel {
        background-color: var(--bg-panel);
      }
      .border-line {
        border-color: var(--border-line);
      }
      .bg-accent-500 {
        background-color: var(--accent-500);
      }
      .hover\\:bg-accent-400:hover {
        background-color: var(--accent-400);
      }
      .text-accent-400 {
        color: var(--accent-400);
      }
      .bg-accent-400 {
        background-color: var(--accent-400);
      }
      .border-accent-500\\/50:hover,
      .hover\\:border-accent-500\\/50:hover {
        border-color: rgba(91, 127, 255, 0.5);
      }
      .focus\\:border-accent-500:focus {
        border-color: var(--accent-500);
      }
      .focus\\:ring-accent-500\\/50:focus {
        --tw-ring-color: rgba(91, 127, 255, 0.5);
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .animate-fadeIn {
        animation: fadeIn 0.3s ease-out forwards;
      }

      /* Efek kilau 3D: sapuan cahaya diagonal saat hover */
      .shine-surface,
      .shine-btn {
        position: relative;
        overflow: hidden;
        isolation: isolate;
      }
      .shine-surface::after,
      .shine-btn::after {
        content: "";
        position: absolute;
        top: 0;
        left: -60%;
        width: 40%;
        height: 100%;
        background: linear-gradient(
          115deg,
          transparent 20%,
          rgba(255, 255, 255, 0.06) 45%,
          rgba(255, 255, 255, 0.14) 50%,
          rgba(255, 255, 255, 0.06) 55%,
          transparent 80%
        );
        transform: skewX(-20deg);
        transition: left 0.85s cubic-bezier(0.19, 1, 0.22, 1);
        pointer-events: none;
        z-index: 1;
      }
      .shine-surface:hover::after,
      .shine-btn:hover::after {
        left: 130%;
      }
      .shine-btn::after {
        background: linear-gradient(
          115deg,
          transparent 20%,
          rgba(255, 255, 255, 0.1) 45%,
          rgba(255, 255, 255, 0.28) 50%,
          rgba(255, 255, 255, 0.1) 55%,
          transparent 80%
        );
      }
    `}</style>
  );
}
