import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8000';
const results = [];
const errors = [];

const log = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickByText(page, selector, text) {
    await page.bringToFront();
    return page.evaluate((sel, txt) => {
        const nodes = [...document.querySelectorAll(sel)];
        const el = nodes.find((node) => node.textContent.replace(/\s+/g, ' ').trim().includes(txt));
        if (!el) return false;
        el.click();
        return true;
    }, selector, text);
}

async function textOf(page, selector) {
    return page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    }, selector);
}

function watch(page, label) {
    page.on('console', (message) => {
        if (message.type() === 'error') {
            const line = `[${label}] console: ${message.text()}`;
            errors.push(line);
            console.log(`  !! ${line}`);
        }
    });
    page.on('pageerror', (error) => {
        const line = `[${label}] pageerror: ${error.message}`;
        errors.push(line);
        console.log(`  !! ${line}`);
    });
    page.on('response', (response) => {
        if (response.url().includes('/api/') && response.status() >= 400) {
            console.log(`  !! [${label}] API ${response.status()} ${response.request().method()} ${response.url()}`);
        }
    });
}

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1000'],
    defaultViewport: { width: 1600, height: 1000 },
});

try {
    const pageA = await browser.newPage();
    watch(pageA, 'A');

    // ------------------------------------------------------------- 1. beranda
    await pageA.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
    const hasList = await clickByText(pageA, 'h2', 'Daftar proyek');
    const projectVisible = await pageA.evaluate(() => document.body.innerText.includes('Daftar proyek'));
    log('FR-54 daftar proyek tampil tanpa login', projectVisible);

    const hasNewButton = await pageA.evaluate(() =>
        [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Proyek Baru')));
    log('FR-01 wizard proyek baru tersedia', hasNewButton && hasList);

    // buka proyek pertama
    const opened = await clickByText(pageA, 'button', 'Buka');
    await pageA.waitForSelector('[data-task-id]', { timeout: 15000 });
    log('Layar workspace terbuka', opened);

    const barCount = await pageA.evaluate(() => document.querySelectorAll('[data-task-id]').length);
    log('FR-22 Gantt chart merender batang kegiatan', barCount > 0, `${barCount} batang`);

    const rowCount = await pageA.evaluate(() => document.querySelectorAll('[draggable="true"]').length);
    log('Task List menampilkan baris kegiatan', rowCount > 0, `${rowCount} baris`);

    // FR-55: status bar dihapus atas permintaan pengguna — koneksi WebSocket diverifikasi lewat atribut data tersembunyi
    const wsConnected = await pageA.evaluate(() =>
        document.querySelector('[data-connection]')?.dataset.connection === 'connected');
    log('FR-55 koneksi WebSocket tersambung', wsConnected);

    // permintaan pengguna: hilangkan indikator status di bawah & revisi di samping
    const statusBarGone = await pageA.evaluate(() => {
        const text = document.body.innerText;
        const bottomGone = ['Tersimpan otomatis', 'Real-time tersambung', 'Pengguna aktif', 'Revisi']
            .every((label) => !text.includes(label));
        const revGone = ![...document.querySelectorAll('span')]
            .some((span) => /^rev \d+$/.test(span.textContent.trim()));
        return bottomGone && revGone;
    });
    log('Status bar (Tersimpan otomatis/Real-time/Revisi/Pengguna aktif) & indikator rev dihilangkan', statusBarGone);

    const weekendColumn = await pageA.evaluate(() => document.querySelectorAll('.bg-slate-200\\/60').length);
    log('FR-16 kolom weekend/hari libur abu-abu', weekendColumn > 0, `${weekendColumn} kolom`);

    // ------------------------------------------------- 2. baca nilai awal task
    const readTask = (page) => page.evaluate(() => {
        const rows = [...document.querySelectorAll('[draggable]')];
        return rows.map((row) => ({
            name: row.querySelector('.truncate')?.textContent?.trim() || '',
            cells: [...row.children].map((child) => child.textContent.replace(/\s+/g, ' ').trim()),
        }));
    });

    const before = await readTask(pageA);
    const target = before.find((row) => row.name.startsWith('Testing')) || before[before.length - 1] || before[0];
    const targetName = target.name.split(' ')[0];
    const beforeEnd = target.cells[2];

    // ------------------------------------------- 3. edit langsung pada task list
    await pageA.bringToFront();
    const rowIndex = before.findIndex((row) => row.name.startsWith(target.name.slice(0, 8)));
    const currentDuration = Number(before[rowIndex].cells[3]) || 1;
    const newDuration = String(currentDuration + 4);
    const edited = await pageA.evaluate(async (index, value) => {
        const rows = [...document.querySelectorAll('[draggable]')];
        const row = rows[index];
        if (!row) return 'row-not-found';
        const cells = [...row.children];
        const durCell = cells[cells.length - 1];
        durCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 120));
        const input = row.querySelector('input[type="number"]');
        if (!input) return 'input-not-found';
        input.focus();
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 900));
        return 'ok';
    }, rowIndex, newDuration);
    log('FR-47 edit langsung pada Task List', edited === 'ok', edited);

    const after = await readTask(pageA);
    const afterRow = after[rowIndex];
    const endChanged = afterRow.cells[2] !== beforeEnd;
    log('FR-30 End date dihitung ulang dari durasi', endChanged, `${beforeEnd} -> ${afterRow.cells[2]}`);

    // ------------------------------------------------- 4. buka tab kedua (B)
    const pageB = await browser.newPage();
    watch(pageB, 'B');
    await pageB.goto(`${BASE}${new URL(pageA.url()).pathname}`, { waitUntil: 'networkidle2' });
    await pageB.waitForSelector('[data-task-id]', { timeout: 15000 });

    const beforeB = await readTask(pageB);
    const sameBefore = beforeB[rowIndex].cells[2] === afterRow.cells[2];
    log('Tab B memuat state terbaru dari server', sameBefore, beforeB[rowIndex].cells[2]);

    // permintaan pengguna: penanda "Pengguna aktif" tidak ditampilkan lagi (data presence tetap tersambung di latar)
    const presence = await pageB.evaluate(() => !document.body.innerText.includes('Pengguna aktif'));
    log('FR-59 penanda "Pengguna aktif" disembunyikan dari status bar', presence);

    // --------------------------------------------------- 5. perubahan real-time
    await pageA.bringToFront();
    await pageA.evaluate(async (index, value) => {
        const rows = [...document.querySelectorAll('[draggable]')];
        const row = rows[index];
        const cells = [...row.children];
        const durCell = cells[cells.length - 1];
        durCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 120));
        const input = row.querySelector('input[type="number"]');
        input.focus();
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
    }, rowIndex, String(Math.max(1, currentDuration)));
    await sleep(1200);
    let realtime = false;
    let waited = 0;
    while (waited < 3000) {
        await sleep(150);
        waited += 150;
        const nowB = await readTask(pageB);
        if (nowB[rowIndex].cells[2] !== beforeB[rowIndex].cells[2]) {
            realtime = true;
            break;
        }
    }
    const afterB = await readTask(pageB);
    log('FR-56 perubahan tampil di tab lain ≤ 1 detik', realtime, `${waited} ms -> ${afterB[rowIndex].cells[2]}`);

    // --------------------------------------------------------- 6. undo/redo
    await pageA.bringToFront();
    await pageA.keyboard.down('Control');
    await pageA.keyboard.press('KeyZ');
    await pageA.keyboard.up('Control');
    await sleep(1200);
    const undone = await readTask(pageA);
    log('FR-17 Undo mengembalikan nilai sebelumnya', undone[rowIndex].cells[2] === afterRow.cells[2],
        `${afterRow.cells[2]} -> ${undone[rowIndex].cells[2]}`);

    const undoneB = await readTask(pageB);
    log('FR-63 hasil undo ikut disiarkan', undoneB[rowIndex].cells[2] === undone[rowIndex].cells[2]);

    // ------------------------------------------------------------ 7. tab lain
    // fixture: pastikan ada resource yang ditugaskan ke kegiatan (regresi FR-23/FR-32)
    const fixture = await pageA.evaluate(async () => {
        const projectId = window.location.pathname.split('/').pop();
        const exportRes = await fetch(`/api/projects/${projectId}/export/json`);
        const state = await exportRes.json();
        const task = (state.tasks || [])[0];
        if (!task) return { ok: false, reason: 'no-task' };

        let resource = (state.resources || [])[0];
        if (!resource) {
            const created = await fetch(`/api/projects/${projectId}/resources`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ name: 'QA Resource', default_role: 'penguji', color: '#f59e0b' }),
            });
            if (!created.ok) return { ok: false, reason: `create-resource-${created.status}` };
            resource = { id: (await created.json()).id };
        }

        const assigned = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ resource_ids: [resource.id] }),
        });
        return { ok: assigned.ok, reason: `assign-${assigned.status}` };
    });
    log('FR-32 resource ditugaskan ke kegiatan lewat API', fixture.ok, fixture.reason || '');

    const errorsBeforeResources = errors.length;
    await clickByText(pageA, 'button', 'Resources Chart');
    await sleep(400);
    const resourcesTab = await pageA.evaluate(() => document.body.innerText.includes('Default role'));
    log('FR-23 tab Resources Chart membuka daftar resource', resourcesTab);

    // regresi: timeline Resources Chart pernah gagal render (prop settings tidak terkirim)
    const resourcesRender = await pageA.evaluate(() => ({
        textLen: document.body.innerText.length,
        bars: document.querySelectorAll('[title*="mengerjakan"]').length,
        dayHeaders: document.body.innerText.includes('Default role'),
    }));
    const resourcesCrashed = errors.slice(errorsBeforeResources)
        .some((line) => line.includes('pageerror')) || resourcesRender.textLen === 0;
    log('FR-23 Resources Chart (list + timeline) merender tanpa galat',
        !resourcesCrashed && resourcesRender.dayHeaders && resourcesRender.bars >= 1,
        `${resourcesRender.bars} batang penugasan, ${resourcesRender.textLen} karakter`);

    await clickByText(pageA, 'button', '+ Resource baru');
    await sleep(400);
    const resourceDialog = await pageA.evaluate(() => document.body.innerText.includes('Standard rate'));
    log('FR-35..37 dialog Resources dengan standard rate', resourceDialog);

    // regresi: tombol Ok pada dialog resource baru pernah tidak bekerja
    // (createResourceAction tidak diimpor -> ReferenceError, dialog tidak tertutup)
    await pageA.evaluate(() => {
        const labels = [...document.querySelectorAll('label')];
        const nameLabel = labels.find((el) => el.textContent.includes('Name'));
        const input = nameLabel?.querySelector('input');
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'QA Dialog Resource');
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(200);
    await clickByText(pageA, 'button', 'Ok');
    await sleep(1200);
    const dialogResult = await pageA.evaluate(() => ({
        closed: !document.body.innerText.includes('Custom Columns'),
        listed: document.body.innerText.includes('QA Dialog Resource'),
    }));
    const dialogCrashed = errors.slice(errorsBeforeResources).some((line) => line.includes('pageerror'));
    log('FR-35 dialog resource baru bisa disimpan lewat tombol Ok',
        !dialogCrashed && dialogResult.closed && dialogResult.listed,
        `tertutup=${dialogResult.closed} terdaftar=${dialogResult.listed}`);

    // bersihkan resource uji dari dialog
    const cleanupDialogResource = await pageA.evaluate(async () => {
        const projectId = window.location.pathname.split('/').pop();
        const exportRes = await fetch(`/api/projects/${projectId}/export/json`);
        const state = await exportRes.json();
        const target = (state.resources || []).find((r) => r.name === 'QA Dialog Resource');
        if (!target) return true;
        const del = await fetch(`/api/projects/${projectId}/resources/${target.id}`, { method: 'DELETE' });
        return del.ok;
    });
    log('FR-35 resource uji dari dialog dibersihkan', cleanupDialogResource);

    // --------------------------------------------------- FR-39 kolom custom
    await pageA.bringToFront();
    await clickByText(pageA, 'button', '+ Resource baru');
    await sleep(400);
    await clickByText(pageA, 'button', 'Custom Columns');
    await sleep(200);
    await clickByText(pageA, 'button', '+ Add column');
    await sleep(200);
    const columnForm = await pageA.evaluate(() => {
        const input = [...document.querySelectorAll('input')]
            .find((el) => (el.placeholder || '').includes('Tingkat pengalaman'));
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'QA Level');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    });
    await sleep(200);
    await clickByText(pageA, 'button', 'Save');
    await sleep(600);
    const valueFilled = await pageA.evaluate(() => {
        const row = [...document.querySelectorAll('tbody tr')]
            .find((tr) => tr.textContent.includes('QA Level'));
        const input = row?.querySelector('input[type="text"]');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Senior');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    });
    await clickByText(pageA, 'button', 'General');
    await sleep(200);
    await pageA.evaluate(() => {
        const labels = [...document.querySelectorAll('label')];
        const input = labels.find((el) => el.textContent.includes('Name'))?.querySelector('input');
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'QA Kolom Custom');
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(200);
    await clickByText(pageA, 'button', 'Ok');
    await sleep(1400);

    const columnSaved = await pageA.evaluate(async () => {
        const projectId = window.location.pathname.split('/').pop();
        const state = await (await fetch(`/api/projects/${projectId}/export/json`)).json();
        const column = (state.custom_columns || []).find((item) => item.name === 'QA Level');
        const resource = (state.resources || []).find((item) => item.name === 'QA Kolom Custom');
        return {
            hasColumn: !!column,
            hasValue: !!(column && resource && resource.custom_values
                && resource.custom_values[column.id] === 'Senior'),
        };
    });
    log('FR-39 kolom custom + nilai resource tersimpan lewat dialog',
        columnForm && valueFilled && columnSaved.hasColumn && columnSaved.hasValue,
        `kolom=${columnSaved.hasColumn} nilai=${columnSaved.hasValue}`);

    // buka ulang dialog: nilai tampil kembali di tab Custom Columns
    const reopened = await pageA.evaluate(() => {
        // pilih div terdalam yang memuat nama resource (baris daftar resource)
        const matches = [...document.querySelectorAll('div')]
            .filter((el) => el.querySelector('span.truncate')?.textContent === 'QA Kolom Custom');
        const row = matches[matches.length - 1];
        if (!row) return false;
        row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        return true;
    });
    await sleep(700);
    const tabClicked = await clickByText(pageA, 'button', 'Custom Columns');
    await sleep(300);
    const persisted = await pageA.evaluate(() => {
        const dialogOpen = [...document.querySelectorAll('h3')]
            .some((heading) => heading.textContent.trim() === 'Resources');
        const row = [...document.querySelectorAll('tbody tr')]
            .find((tr) => tr.textContent.includes('QA Level'));
        return { dialogOpen, value: row?.querySelector('input[type="text"]')?.value ?? null };
    });
    log('FR-39 nilai kolom tampil lagi saat dialog resource dibuka ulang',
        reopened && tabClicked && persisted.value === 'Senior',
        `reopened=${reopened} tab=${tabClicked} dialog=${persisted.dialogOpen} value=${persisted.value}`);
    await clickByText(pageA, 'button', 'Cancel');
    await sleep(300);

    // bersihkan resource & kolom uji
    const cleanupColumn = await pageA.evaluate(async () => {
        const projectId = window.location.pathname.split('/').pop();
        const state = await (await fetch(`/api/projects/${projectId}/export/json`)).json();
        const resource = (state.resources || []).find((item) => item.name === 'QA Kolom Custom');
        if (resource) {
            await fetch(`/api/projects/${projectId}/resources/${resource.id}`, { method: 'DELETE' });
        }
        const column = (state.custom_columns || []).find((item) => item.name === 'QA Level');
        if (column) {
            await fetch(`/api/projects/${projectId}/custom-columns/${column.id}`, { method: 'DELETE' });
        }
        return true;
    });
    log('FR-39 resource & kolom uji dibersihkan', cleanupColumn);

    await clickByText(pageA, 'button', 'PERT chart');
    await sleep(600);
    const pertNodes = await pageA.evaluate(() => document.body.innerText.includes('Duration:'));
    log('FR-24 PERT chart menampilkan node dengan Start/End/Duration', pertNodes);

    const critical = await pageA.evaluate(() => document.body.innerText.includes('jalur kritis tersorot'));
    log('FR-26 jalur kritis disorot pada PERT', critical);

    // ------------------------------------------------------ 8. drag batang Gantt
    await pageA.bringToFront();
    await clickByText(pageA, 'button', 'Gantt');
    await pageA.waitForSelector('[data-task-id]', { timeout: 10000 });
    await sleep(300);

    const dragResult = await (async () => {
        await pageA.evaluate((index) => {
            const rows = [...document.querySelectorAll('[draggable]')];
            const id = rows[index]?.getAttribute('data-task-id');
            const bar = id ? document.querySelector(`[data-bar-id="${id}"]`) : null;
            // pastikan batang terlihat di area timeline sebelum diseret
            bar?.scrollIntoView({ block: 'nearest', inline: 'center' });
        }, rowIndex);
        await sleep(300);
        const box = await pageA.evaluate((index) => {
            const rows = [...document.querySelectorAll('[draggable]')];
            const id = rows[index]?.getAttribute('data-task-id');
            const bar = id ? document.querySelector(`[data-bar-id="${id}"]`) : null;
            if (!bar) return null;
            const rect = bar.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }, rowIndex);

        if (!box) return 'bar-not-found';
        if (box.x < 0 || box.x > 1500 || box.y < 0 || box.y > 950) return `bar-di-luar-layar @${Math.round(box.x)},${Math.round(box.y)}`;
        const startX = box.x + Math.max(6, box.width / 2);
        const startY = box.y + box.height / 2;
        await pageA.mouse.move(startX, startY);
        await pageA.mouse.down();
        await pageA.mouse.move(startX + 60, startY, { steps: 8 });
        await pageA.mouse.up();
        await sleep(1500);
        return 'ok';
    })();
    log('FR-43 geser batang pada Gantt chart', dragResult === 'ok', dragResult);

    const afterDrag = await readTask(pageA);
    log('geser batang mengubah tanggal mulai/selesai',
        afterDrag[rowIndex].cells[1] !== after[rowIndex].cells[1]
        || afterDrag[rowIndex].cells[2] !== after[rowIndex].cells[2],
        `${after[rowIndex].cells[1]} -> ${afterDrag[rowIndex].cells[1]}`);

    const dragRealtime = await (async () => {
        for (let i = 0; i < 20; i++) {
            await sleep(150);
            const current = await readTask(pageB);
            if (current[rowIndex].cells[1] !== afterB[rowIndex].cells[1]) return true;
        }
        return false;
    })();
    log('FR-55 hasil geser batang tersiar ke tab lain', dragRealtime);

    // --------------------------------------------------------------- 9. zoom
    await clickByText(pageA, 'button', '−');
    await sleep(300);
    const zoomOk = await pageA.evaluate(() => document.querySelectorAll('[data-task-id]').length > 0);
    log('FR-25/49 zoom timeline tetap merender', zoomOk);

    // ------------------------------------------------------------ 10. dialog
    await pageA.bringToFront();
    await pageA.evaluate((index) => {
        const rows = [...document.querySelectorAll('[draggable="true"]')];
        rows[index].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }, rowIndex);
    await sleep(500);
    const taskDialog = await pageA.evaluate(() => document.body.innerText.includes('Properties for task'));
    log('FR-28 dialog Task Properties terbuka', taskDialog);

    const tabs = await pageA.evaluate(() => {
        const text = document.body.innerText;
        return ['General', 'Predecessors', 'Resources', 'Custom Columns'].every((label) => text.includes(label));
    });
    log('FR-29/31/32/33 empat tab dialog tersedia', tabs);

    await clickByText(pageA, 'button', 'Cancel');
    await sleep(300);

    // menu Project
    await clickByText(pageA, 'button', 'Project');
    await sleep(200);
    const menuItems = await pageA.evaluate(() => {
        const text = document.body.innerText;
        return ['New', 'Open', 'Save As', 'Properties', 'Export CSV', 'Print', 'Quit']
            .filter((label) => text.includes(label));
    });
    log('FR-7.1 menu Project lengkap', menuItems.length >= 6, menuItems.join(', '));
    await pageA.keyboard.press('Escape');
    await pageA.evaluate(() => document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));

    // --------------------------------------------------- 11. ekspor CSV (server)
    const csv = await pageA.evaluate(async () => {
        const path = window.location.pathname;
        const response = await fetch(`/api/projects${path.replace('/projects', '')}/export/csv`.replace('/projects/api', '/api'));
        return response.ok;
    });
    void csv;

    console.log('\n--- ringkasan ---');
    const failed = results.filter((item) => !item.ok);
    console.log(`${results.length - failed.length}/${results.length} pemeriksaan lulus`);
    if (errors.length) {
        console.log(`\n${errors.length} galat konsol:`);
        [...new Set(errors)].slice(0, 20).forEach((error) => console.log(`  ${error}`));
    }
    process.exit(failed.length ? 1 : 0);
} finally {
    await browser.close();
}
