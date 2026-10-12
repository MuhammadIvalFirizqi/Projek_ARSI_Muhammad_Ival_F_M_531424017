const TABS = [
    { id: 'gantt', label: 'Gantt' },
    { id: 'resources', label: 'Resources Chart' },
    { id: 'pert', label: 'PERT chart' },
];

export default function Toolbar({
    items, query, setQuery, searchRef, tab, setTab,
}) {
    const button = 'rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white';

    return (
        <div className="flex items-center gap-2 border-b border-slate-300 bg-white px-3 py-2">
            <div className="flex items-center gap-1.5">
                <button type="button" className={button} title="New project (Ctrl+N)" onClick={items.onNew}>Baru</button>
                <button type="button" className={button} title="Open (Ctrl+O)" onClick={items.onOpen}>Buka</button>
                <button type="button" className={button} title="Save As (Ctrl+Shift+S)" onClick={items.onSaveAs}>Simpan Sebagai</button>
                <button type="button" className={button} title="Project properties" onClick={items.onProperties}>Properti</button>
                <div className="mx-1 h-5 w-px bg-slate-300" />
                <button type="button" className={button} disabled={!items.selectedId} title="Cut (Ctrl+X)" onClick={items.onCut}>Potong</button>
                <button type="button" className={button} disabled={!items.selectedId} title="Copy (Ctrl+C)" onClick={items.onCopy}>Salin</button>
                <button type="button" className={button} disabled={!items.selectedId} title="Paste (Ctrl+V)" onClick={items.onPaste}>Tempel</button>
                <div className="mx-1 h-5 w-px bg-slate-300" />
                <button type="button" className={button} disabled={!items.canUndo} title="Undo (Ctrl+Z)" onClick={items.onUndo}>Undo</button>
                <button type="button" className={button} disabled={!items.canRedo} title="Redo (Ctrl+Y)" onClick={items.onRedo}>Redo</button>
                <div className="mx-1 h-5 w-px bg-slate-300" />
                <button type="button" className={button} title="Zoom in" onClick={items.view.zoomIn}>−</button>
                <button type="button" className={button} title="Zoom out" onClick={items.view.zoomOut}>+</button>
                <button type="button" className={button} onClick={items.view.goToday}>Today</button>
                <button type="button" className={button} onClick={items.view.goPast}>Past</button>
                <button type="button" className={button} onClick={items.view.goFuture}>Future</button>
                <button
                    type="button"
                    className={`${button} ${items.view.showCritical ? 'border-red-400 bg-red-50 text-red-700' : ''}`}
                    title="Tampilkan jalur kritis"
                    onClick={items.view.toggleCritical}
                >
                    Jalur kritis
                </button>
            </div>

            <div className="ml-auto flex items-center gap-3">
                <input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Cari kegiatan (Ctrl+F)"
                    className="w-56 rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
                <div className="flex items-center gap-1 rounded border border-slate-300 bg-slate-50 p-1">
                    {TABS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setTab(item.id)}
                            className={`rounded px-3 py-1 text-sm ${
                                tab === item.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
