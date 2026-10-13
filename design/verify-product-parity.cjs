const { chromium } = require('../tests/node_modules/playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({channel:'chrome'});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    const url=pathToFileURL(path.join(__dirname,'index.html')).href;
    for(const mode of ['empty','awake','settling','nap','night','night-awake','morning']) {
      await page.goto('about:blank'); await page.goto(url+'#day');
      await page.evaluate(mode=>{
        if(mode==='empty') state.empty=true;
        if(mode==='settling') state.settling={start:850,startedAt:Date.now()};
        if(mode==='nap') state.sleeps.push({id:'active',kind:'nap',start:850,end:null});
        if(['night','night-awake','morning'].includes(mode)) {state.activeNightStart=1210;state.now=mode==='morning'?1800:1400;}
        if(mode==='night-awake') state.nightWakings=[{id:'w1',start:1390,end:null}];
        render();
      },mode);
      await page.getByRole('button',{name:'Добавить событие',exact:true}).click();
      assert.equal(await page.getByLabel('Тип события').locator('option').count(),3);
      await page.keyboard.press('Escape');
    }
    // Night wake / resume / morning: finish starts at the last resumed interval.
    await page.goto('about:blank');await page.goto(url+'#night');
    await page.getByRole('button',{name:'Ночное бодрствование',exact:true}).click();
    await page.evaluate(()=>{state.now+=20;render()});
    await page.getByRole('button',{name:'Снова уснул',exact:true}).click();
    await page.getByRole('button',{name:'Проснулся',exact:true}).click();
    assert.equal(await page.locator('#sleep-start').inputValue(),'2026-10-03T23:30');
    await page.keyboard.press('Escape');
    await page.locator('[data-action="edit-night-waking"]').click();
    await page.locator('#sleep-end').fill('2026-10-03T23:25');
    await page.locator('#sleep-form .primary').click();
    assert.equal(await page.evaluate(()=>state.nightWakings[0].end),1405);
    await page.getByRole('button',{name:'Добавить событие',exact:true}).click();
    await page.getByLabel('Тип события').selectOption('night_awake');
    await page.locator('#sleep-start').fill('2026-10-03T22:00');
    await page.locator('#sleep-end').fill('2026-10-03T22:15');
    await page.locator('#sleep-form .primary').click();
    assert.equal(await page.locator('[data-action="edit-night-waking"]').count(),2);
    await page.getByRole('button',{name:'Проснулся',exact:true}).click();
    await page.locator('#sleep-form .primary').click();
    assert.match(await page.locator('.hero').innerText(),/Сон завершён/);
    // Settling boundaries can be edited independently from the sleep start.
    await page.goto('about:blank');await page.goto(url+'#day');
    await page.evaluate(()=>{state.sleeps[0].settleStart=640;render()});
    await page.getByRole('button',{name:'Изменить укладывание',exact:true}).click();
    await page.locator('#settling-start').fill('2026-10-03T10:35');
    await page.locator('#settling-end').fill('2026-10-03T10:45');
    await page.locator('#edit-settling-form .primary').click();
    assert.match(await page.locator('.timeline').innerText(),/10:35 — 10:45/);
    // Calendar clipping, selected-row bounds, calculation order, both themes.
    await page.evaluate(()=>{navigate('statistics');insights.tab='rhythm';render()});
    for(const theme of ['light','dark']) for(const width of [320,390,430]) {
      await page.setViewportSize({width,height:844});
      await page.evaluate(theme=>{reporting.theme=theme;applyReportTheme();render()},theme);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const detail=await page.locator('.daily-detail').boundingBox(), calc=await page.locator('.calculation-section').boundingBox();
      assert.ok(calc.y>=detail.y+detail.height);
      const card=await page.locator('.rhythm-card').boundingBox(), selected=await page.locator('.rhythm-row[aria-pressed="true"]').boundingBox();
      assert.ok(Math.abs(card.x-selected.x)<=2 && Math.abs(card.width-selected.width)<=2,JSON.stringify({card,selected}));
    }
    assert.equal(await page.locator('.rhythm-axis span').last().innerText(),'22:00');
    assert.equal(await page.locator('[data-date="2026-10-01"] .night-awake').count(),0);
    assert.equal(await page.locator('[data-date="2026-10-02"] .night-awake').count(),1);
    await page.evaluate(()=>{reportSamples.find(r=>r.date==='2026-10-01').nightWakings=[[1430,1460]];render()});
    assert.equal(await page.locator('.rhythm-axis span').first().innerText(),'00:00');
    assert.equal(await page.locator('.rhythm-axis span').last().innerText(),'00:00');
    assert.equal(await page.locator('[data-date="2026-10-01"] .night-awake').count(),1);
    assert.equal(await page.locator('[data-date="2026-10-02"] .night-awake').count(),1);
    await page.screenshot({path:'/tmp/demo-current-rhythm.png',fullPage:true});
    await page.evaluate(()=>{state.savedNight=null;navigate('night')});
    await page.screenshot({path:'/tmp/demo-current-night.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('Product parity: event access in seven modes, night waking, resumed sleep, settling editor, calendar clipping, calculations and mobile themes passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
