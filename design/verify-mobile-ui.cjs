const { chromium } = require('../tests/node_modules/playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try {
  for(const platform of ['ios','android']) {
   const page=await browser.newPage({viewport:{width:390,height:844}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href+`?platform=${platform}#profile`);
   for(const theme of ['light','dark']) {
    await page.evaluate(t=>{reporting.theme=t;applyReportTheme();render()},theme);
    for(const width of [320,390,430]) {
     await page.setViewportSize({width,height:844});
     for(const route of ['day','statistics','profile','history','schedules']) {
      await page.evaluate(r=>navigate(r),route);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${platform}/${theme}/${route}/${width}`);
      assert.equal(await page.locator('[data-konsta="Tabbar"]').count(),1);
      const nav=page.locator('#navigation [data-route="profile"]');
      assert(await nav.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}), 'Navigation must stay above page content');
      if(width===390) await page.screenshot({path:path.join(__dirname,`previews/konsta-${platform}-${theme}-${route}.png`),fullPage:true});
     }
    }
   }
   await page.evaluate(()=>{reporting.theme='light';applyReportTheme();navigate('statistics')});
   await page.getByRole('button',{name:'Действия со статистикой'}).click();
   await page.getByRole('button',{name:'Скачать CSV',exact:true}).click();
   assert.equal(await page.locator('#sheet [data-konsta="ListInput"]').count(),2);
   assert.equal(await page.getByLabel('С',{exact:true}).getAttribute('type'),'date');
   await page.screenshot({path:path.join(__dirname,`previews/konsta-${platform}-export.png`),fullPage:true});
   await page.keyboard.press('Escape');
   await page.evaluate(()=>navigate('profile'));
   await page.locator('[data-report="appearance"]').click();
   await page.locator('[data-theme-choice="dark"]').click();
   assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('dark')),true);
   assert.deepEqual(errors,[]);
   await page.close();
  }
  console.log('Konsta iOS/Material: 5 routes, light/dark, 320/390/430; real components, navigation stacking, accessible forms and theme switching passed.');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
