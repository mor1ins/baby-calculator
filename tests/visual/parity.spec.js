import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
const example = name => JSON.parse(readFileSync(new URL(`../../api/examples/${name}.json`, import.meta.url)));

for (const platform of ['ios','android']) for (const mode of ['light','dark']) {
 test(`reference parity: ${platform}, ${mode}, phone and tablet`,async({browser,baseURL},testInfo)=>{
    test.setTimeout(90000);
    const context=await browser.newContext({baseURL,viewport:{width:390,height:844},colorScheme:mode,userAgent:platform==='android'?'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'});
    const page=await context.newPage(),reference=await context.newPage(),day=example('day');
    await page.clock.setFixedTime(new Date(day.as_of));
    await page.route('**/api/v1/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      const session=example('session');session.user.name='Анна Смирнова';
      let body={items:[]};
      if(path.endsWith('/session'))body=session;
      else if(path.endsWith('/child'))body={profile:{name:'Саша',born:'2026-02-03',sex:'boy'},version:0};
      else if(path.endsWith('/schedules'))body={items:[{...day.schedule,id:day.schedule.source_id,version:1,archived:false}]};
      else if(path.includes('/days/'))body=path.endsWith(day.date)?day:example('empty-day');
      await route.fulfill({json:body});
    });
    await reference.goto(new URL(`../../design/index.html?platform=${platform}#day`,import.meta.url).href);
    await page.goto('/');
    await expect(page.locator('.hero')).toBeVisible();
    await page.evaluate(()=>document.fonts.ready);await reference.evaluate(()=>document.fonts.ready);
    for(const width of [320,390,768]){
      await page.setViewportSize({width,height:844});await reference.setViewportSize({width,height:844});
      for(const selector of ['.app-header','.page-head','.child-card','.schedule-strip','.hero','.metrics','.bottom-nav']){
        const actual=await page.locator(selector).boundingBox(),expected=await reference.locator(selector).boundingBox();
        for(const key of ['x','y','width','height'])expect(Math.abs(actual[key]-expected[key]),`${selector} ${key} at ${width}`).toBeLessThan(1);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
      await page.screenshot({path:testInfo.outputPath(`app-${width}.png`),fullPage:true});
      await reference.screenshot({path:testInfo.outputPath(`reference-${width}.png`),fullPage:true});
    }
    await page.setViewportSize({width:390,height:844});await reference.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Уже уснул',exact:true}).click();await reference.locator('[data-action="start"]').click();
    const actual=await page.getByRole('dialog').boundingBox(),expected=await reference.getByRole('dialog').boundingBox();
    expect(Math.abs(actual.height-expected.height)).toBeLessThan(1);
    await page.getByRole('spinbutton').press('Home');await expect(page.getByRole('spinbutton')).toHaveAttribute('aria-valuenow','0');
    await page.screenshot({path:testInfo.outputPath('sleep-dialog.png')});
    await context.close();
 });
}
