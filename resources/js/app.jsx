// Suntikkan runtime React Fast Refresh (HMR) untuk dev.
// HTML dilayani oleh Blade (bukan transformIndexHtml Vite), jadi tanpa impor ini
// mount React gagal dengan "@vitejs/plugin-react can't detect preamble".
// Saat `vite build`, modul virtual ini kosong jadi tidak berpengaruh di produksi.
import '@vitejs/plugin-react/preamble';
import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';
import '../css/app.css';

createInertiaApp({
    resolve: async (name) => {
        const pages = import.meta.glob('./Pages/**/*.jsx');
        const loader = pages[`./Pages/${name}.jsx`];
        if (!loader) throw new Error(`Halaman Inertia tidak ditemukan: ${name}`);
        const module = await loader();
        return module.default;
    },
    setup({ el, App, props }) {
        createRoot(el).render(<App {...props} />);
    },
});
