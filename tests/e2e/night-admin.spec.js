import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const password = 'Prototype-check-123';
const dateTime = (value) => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
}).format(value).replace(' ', 'T');

async function login(page, email) {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page.getByText(/Здравствуйте,/)).toBeVisible();
}

test('night event undo, admin read-only view and immediate account block', async ({ page, browser }) => {
    const email = `night-${Date.now()}@example.com`;
    const adminEmail = `admin-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.getByLabel('Ваше имя').fill('Ночной сценарий');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();
    await expect(page.getByText(/Здравствуйте, Ночной сценарий/)).toBeVisible();
    await page.getByRole('button', { name: 'Записать сон вручную' }).click();
    const day = dateTime(new Date(Date.now() - 86400000)).slice(0, 10);
    await page.getByLabel('День цикла', { exact: true }).fill(day);
    await page.getByLabel('Вид сна').selectOption('night');
    await page.getByLabel('Начало сна').fill(dateTime(new Date(Date.now() - 120000)));
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await page.getByLabel('День дневника').fill(day);
    await page.getByRole('button', { name: 'Проснулся / заплакал', exact: true }).click();
    await expect(page.getByText('Ночных отметок: 1')).toBeVisible();
    await page.getByRole('button', { name: 'Отменить последнюю', exact: true }).click();
    await expect(page.getByText('Ночных отметок: 0')).toBeVisible();
    await page.getByRole('button', { name: 'Проснулся / заплакал', exact: true }).click();
    await expect(page.getByText('Ночных отметок: 1')).toBeVisible();
    await page.getByRole('button', { name: 'Утренний подъём', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Исправить сон', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Проснулся / заплакал', exact: true })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/night-events.png', fullPage: true });

    const command = JSON.parse(process.env.BABY_ADMIN_COMMAND ||
        '["docker","compose","exec","-T","backend",".venv/bin/python","create_admin.py"]');
    execFileSync(command[0], [...command.slice(1), '--email', adminEmail, '--password-stdin'], {
        cwd: root, input: `${password}\n`, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const adminContext = await browser.newContext({ baseURL: page.url().split('/').slice(0, 3).join('/'),
        viewport: { width: 390, height: 844 } });
    const admin = await adminContext.newPage();
    await login(admin, adminEmail);
    await admin.getByRole('link', { name: 'Открыть список пользователей' }).click();
    await admin.getByLabel('Имя или email').fill(email);
    await admin.getByRole('button', { name: 'Найти', exact: true }).click();
    await admin.getByRole('link', { name: 'Просмотреть дневник' }).click();
    await admin.getByLabel('День дневника').fill(day);
    await expect(admin.getByText('Ночных отметок: 1')).toBeVisible();
    await expect(admin.getByRole('button', { name: /Исправить|Записать сон|Удалить/ })).toHaveCount(0);
    await admin.getByRole('link', { name: 'К пользователям', exact: true }).click();
    await admin.getByLabel('Имя или email').fill(email);
    await admin.getByRole('button', { name: 'Найти', exact: true }).click();
    await admin.getByLabel('Причина изменения статуса').fill('Проверка блокировки');
    await admin.getByRole('button', { name: 'Заблокировать', exact: true }).click();
    await expect(admin.getByText('Заблокирован', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Доступ к аккаунту ограничен');
    await adminContext.close();
});
