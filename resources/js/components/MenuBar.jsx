import { useEffect, useRef, useState } from 'react';

const SHORTCUTS = {
    new: 'Ctrl+N',
    open: 'Ctrl+O',
    saveAs: 'Ctrl+Shift+S',
    print: 'Ctrl+P',
    quit: 'Ctrl+Q',
    undo: 'Ctrl+Z',
    redo: 'Ctrl+Y',
    search: 'Ctrl+F',
    refresh: 'F5',
};

export default function MenuBar({ items }) {
    const [open, setOpen] = useState(null);
    const ref = useRef(null);

    useEffect(() => {
        const onClick = (event) => {
            if (ref.current && !ref.current.contains(event.target)) setOpen(null);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    const pick = (action) => () => {
        setOpen(null);
        action?.();
    };

    const menus = [
        {
            id: 'project',
            label: 'Project',
            entries: [
                { label: 'New', shortcut: SHORTCUTS.new, action: items.onNew },
                { label: 'Open…', shortcut: SHORTCUTS.open, action: items.onOpen },
                { label: 'Recent Projects', action: items.onOpen },
                { separator: true },
                { label: 'Save (simpan otomatis)', shortcut: SHORTCUTS.saveAs.replace('Shift+', ''), action: items.onRefresh },
                { label: 'Save As…', shortcut: SHORTCUTS.saveAs, action: items.onSaveAs },
                { separator: true },
                { label: 'Properties…', action: items.onProperties },
                { label: 'Export CSV', action: () => items.onExport('csv') },
                { label: 'Export JSON', action: () => items.onExport('json') },
                { separator: true },
                { label: 'Print Preview / Print', shortcut: SHORTCUTS.print, action: items.onPrint },
                { label: 'Quit', shortcut: SHORTCUTS.quit, action: items.onQuit },
            ],
        },
        {
            id: 'edit',
            label: 'Edit',
            entries: [
                { label: 'Undo', shortcut: SHORTCUTS.undo, disabled: !items.canUndo, action: items.onUndo },
                { label: 'Redo', shortcut: SHORTCUTS.redo, disabled: !items.canRedo, action: items.onRedo },
                { separator: true },
                { label: 'Refresh', shortcut: SHORTCUTS.refresh, action: items.onRefresh },
                { label: 'Search', shortcut: SHORTCUTS.search, action: items.onSearch },
                { separator: true },
                { label: 'Cut', disabled: !items.selectedId, action: items.onCut },
                { label: 'Copy', disabled: !items.selectedId, action: items.onCopy },
                { label: 'Paste', disabled: !items.selectedId, action: items.onPaste },
                { separator: true },
                { label: 'Settings…', action: items.onSettings },
            ],
        },
        {
            id: 'view',
            label: 'View',
            entries: [
                { label: 'Gantt Chart', checked: items.view.tab === 'gantt', action: () => items.view.setTab('gantt') },
                { label: 'Resources Chart', checked: items.view.tab === 'resources', action: () => items.view.setTab('resources') },
                { label: 'PERT Chart', checked: items.view.tab === 'pert', action: () => items.view.setTab('pert') },
                { separator: true },
                { label: 'Zoom In', action: items.view.zoomIn },
                { label: 'Zoom Out', action: items.view.zoomOut },
                { label: 'Today', action: items.view.goToday },
                { label: 'Past', action: items.view.goPast },
                { label: 'Future', action: items.view.goFuture },
                { separator: true },
                { label: 'Show critical path', checked: items.view.showCritical, action: items.view.toggleCritical },
                { label: 'Baselines', disabled: true, note: 'Rilis 2.0' },
            ],
        },
        {
            id: 'task',
            label: 'Task',
            entries: [
                { label: 'New Task', action: items.onNewTask },
                { label: 'New Subtask', disabled: !items.selectedId, action: items.onNewSubtask },
                { separator: true },
                { label: 'Task Properties…', disabled: !items.selectedId, action: items.onTaskProperties },
                { label: 'Delete Task', disabled: !items.selectedId, action: items.onDeleteTask },
            ],
        },
        {
            id: 'resource',
            label: 'Resource',
            entries: [
                { label: 'Resources…', action: items.onResources },
                { label: 'New Resource…', action: items.onNewResource },
            ],
        },
        {
            id: 'help',
            label: 'Help',
            entries: [
                { label: 'Help / Panduan', action: items.onHelp },
                { label: 'About', action: items.onHelp },
            ],
        },
    ];

    return (
        <div ref={ref} className="relative z-40 flex items-center gap-1 border-b border-slate-300 bg-slate-50 px-2 py-1 text-sm">
            <span className="mr-3 pl-1 font-semibold text-slate-700">GanttProject Web</span>
            {menus.map((menu) => (
                <div key={menu.id} className="relative">
                    <button
                        type="button"
                        className={`rounded px-3 py-1.5 ${open === menu.id ? 'bg-blue-600 text-white' : 'hover:bg-slate-200'}`}
                        onClick={() => setOpen(open === menu.id ? null : menu.id)}
                        onMouseEnter={() => open && setOpen(menu.id)}
                    >
                        {menu.label}
                    </button>

                    {open === menu.id && (
                        <div className="absolute left-0 top-full min-w-[260px] rounded border border-slate-300 bg-white py-1 shadow-lg">
                            {menu.entries.map((entry, index) => (entry.separator ? (
                                <div key={index} className="my-1 border-t border-slate-200" />
                            ) : (
                                <button
                                    key={index}
                                    type="button"
                                    disabled={entry.disabled}
                                    onClick={pick(entry.action)}
                                    className="flex w-full items-center justify-between gap-8 px-4 py-1.5 text-left hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                                >
                                    <span className="flex items-center gap-2">
                                        <span className="w-3">{entry.checked ? '✓' : ''}</span>
                                        {entry.label}
                                    </span>
                                    <span className="text-xs text-slate-400">{entry.shortcut || entry.note || ''}</span>
                                </button>
                            )))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
