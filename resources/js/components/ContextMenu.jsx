import { useEffect } from 'react';

export default function ContextMenu({ menu, state, onClose, onAction }) {
    useEffect(() => {
        const close = () => onClose();
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [onClose]);

    const isTask = menu.target?.type === 'task';
    const isResource = menu.target?.type === 'resource';
    const isBackground = !menu.target;

    const entries = [];
    if (isTask) {
        entries.push(
            { id: 'new', label: 'Kegiatan baru' },
            { id: 'subtask', label: 'Sub-kegiatan baru' },
            { id: 'properties', label: 'Task Properties…' },
            { separator: true, id: 'sep1' },
            { id: 'cut', label: 'Cut' },
            { id: 'copy', label: 'Copy' },
            { id: 'paste', label: 'Paste' },
            { separator: true, id: 'sep2' },
            { id: 'indent', label: 'Jadikan sub-kegiatan (Tab)' },
            { id: 'outdent', label: 'Naikkan tingkat (Shift+Tab)' },
            { separator: true, id: 'sep3' },
            { id: 'delete', label: 'Hapus kegiatan', danger: true },
        );
    } else if (isResource) {
        entries.push(
            { id: 'edit-resource', label: 'Ubah resource…' },
            { id: 'new-resource', label: 'Resource baru…' },
        );
    } else if (isBackground) {
        entries.push(
            { id: 'new', label: 'Kegiatan baru' },
            { id: 'paste', label: 'Tempel (Paste)' },
            { id: 'new-resource', label: 'Resource baru…' },
        );
    }

    void state;

    return (
        <div
            className="fixed z-50 min-w-[220px] rounded border border-slate-300 bg-white py-1 shadow-lg"
            style={{ left: menu.x, top: menu.y }}
            onMouseDown={(event) => event.stopPropagation()}
        >
            {entries.map((entry) => (entry.separator ? (
                <div key={entry.id} className="my-1 border-t border-slate-200" />
            ) : (
                <button
                    key={entry.id}
                    type="button"
                    onClick={() => onAction(entry.id)}
                    className={`block w-full px-4 py-1.5 text-left text-sm hover:bg-blue-50 ${entry.danger ? 'text-red-600' : ''}`}
                >
                    {entry.label}
                </button>
            )))}
        </div>
    );
}
