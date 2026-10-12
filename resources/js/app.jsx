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
