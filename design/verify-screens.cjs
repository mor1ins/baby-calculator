const {chromium}=require('../tests/node_modules/playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome'});try{
const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
const routes=['day','night','history','previous','schedules','profile','admin','login','register','blocked','statistics'];
for(const theme of ['light','dark']) {await page.evaluate(t=>{document.documentElement.dataset.theme=t},theme);
for(const width of [320,390,768]) {await page.setViewportSize({width,height:844});for(const route of routes){await page.evaluate(r=>{state.date=2;navigate(r)},route);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route} ${theme} ${width} overflows`); if(width===390) await page.screenshot({path:`design/screenshots/full-${route}-${theme}.png`,fullPage:true});}}}
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.documentElement.dataset.theme='light';navigate('schedules')});
await page.locator('#screen [data-action="edit-schedule"]').first().click(); await page.locator('#plan-name').fill('Спокойный день');await page.locator('#schedule-form .primary').click();await page.getByRole('heading',{name:'Спокойный день',exact:true}).waitFor();
await page.locator('#screen [data-action="new-schedule"]').click();await page.locator('#plan-name').fill('Выходной');await page.screenshot({path:'design/screenshots/full-schedule-editor.png',fullPage:true});await page.locator('#schedule-form .primary').click();await page.getByRole('heading',{name:'Выходной',exact:true}).waitFor();
await page.evaluate(()=>navigate('day'));await page.locator('#screen [data-action="add-sleep"]').click();await page.screenshot({path:'design/screenshots/full-sleep-editor.png',fullPage:true});await page.locator('#sleep-start').fill('2026-10-03T13:00');await page.locator('#sleep-end').fill('2026-10-03T13:20');await page.locator('#sleep-form .primary').click();assert.equal(await page.locator('#sheet').evaluate(e=>e.open),false);
await page.evaluate(()=>navigate('admin'));await page.locator('#user-search').fill('zzzz');await page.getByText('Пользователи не найдены').waitFor();await page.locator('#user-search').fill('');await page.locator('[data-action="view-user"]').first().click();await page.locator('.readonly-banner').waitFor();assert.equal(await page.locator('#screen [data-action="start"]').count(),0);
await page.evaluate(()=>{state.empty=true;navigate('day')});await page.screenshot({path:'design/screenshots/full-first-day.png',fullPage:true});await page.locator('[data-action="first-night"]').click();await page.locator('#first-night-form').waitFor();await page.evaluate(()=>sheet.close());
await page.evaluate(()=>navigate('login'));await page.locator('#email').fill('anna@example.com');await page.locator('#password').fill('example123');await page.locator('#auth-form .primary').click();assert.equal(await page.evaluate(()=>state.route),'day');
assert.deepEqual(errors,[]);console.log('All 11 screens: light/dark, 320/390/768; schedule, sleep, admin, onboarding, login verified.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
