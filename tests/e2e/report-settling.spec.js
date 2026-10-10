import assert from 'node:assert/strict';
import {test} from '@playwright/test';
test('settling, child, report tabs, anonymous CSV and share revocation',async({page,context,browser},testInfo)=>{
 test.setTimeout(90000);
 const api=context.request,base='/api/v1';
 let session=await (await api.get(base+'/session')).json();
 const post=async(path,body,method='POST',version)=>{
  const response=await api.fetch(base+path,{method,data:body,headers:{'X-CSRF-Token':session.csrf_token,...(version!==undefined?{'If-Match':`"${version}"`}:{})}});
  assert(response.ok(),await response.text());return response.status()===204?null:response.json();
 };
 const email=`visual-${Date.now()}@example.com`,password='Local-Design-test-123';
 session=await post('/register',{email,password,name:'Анна Смирнова',timezone:'Europe/Moscow'});
 const plan=await post('/schedules',{name:'Обычный день',segments:[['awake',260],['nap',80],['awake',280],['nap',20],['awake',180],['night',600]].map(([kind,duration_minutes])=>({kind,duration_minutes}))});
 await post('/me',{default_schedule_id:plan.id},'PATCH',session.user.version);
 await post('/child',{name:'Саша',born:'2026-02-03',sex:'boy'},'PUT',0);
 const now=new Date(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow'}).format(now);
 const yesterday=new Date(Date.parse(today+'T12:00:00Z')-864e5).toISOString().slice(0,10);
 await post('/sleeps',{day:yesterday,kind:'night',start:yesterday+'T17:30:00Z',end:today+'T00:00:00+03:00'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await page.getByRole('button',{name:'Начать укладывание',exact:true}).click();
 await page.getByText('Укладывание длится',{exact:true}).waitFor();
 await page.reload();await page.getByText('Укладывание длится',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Завершить без сна',exact:true}).click();
 await page.getByRole('button',{name:'Начать укладывание',exact:true}).click();
 await page.getByRole('button',{name:'Уснул',exact:true}).click();
 await page.getByRole('button',{name:'Записать сон',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Засыпание не может'}).waitFor();
 await page.getByRole('spinbutton',{name:'Минут назад'}).focus();await page.keyboard.press('Home');
 await page.getByRole('button',{name:'Записать сон',exact:true}).click();
 await page.getByRole('button',{name:'Проснулся',exact:true}).waitFor();
 await page.getByRole('button',{name:'Проснулся',exact:true}).click();
 await page.getByRole('link',{name:'Профиль',exact:true}).click();
 await page.getByRole('button',{name:'Редактировать профиль малыша',exact:true}).click();
 await page.getByLabel('Имя малыша',{exact:true}).fill('Саша тест');
 await page.getByRole('button',{name:'Сохранить профиль малыша',exact:true}).click();
 await page.getByRole('heading',{name:'Саша тест',exact:true}).waitFor();
 await page.goto(`/statistics?from=${yesterday}&to=${today}`);
 for(const theme of ['light','dark']){
  await page.emulateMedia({colorScheme:theme});
  for(const width of [320,390,768]){
   await page.setViewportSize({width,height:844});
   for(const name of ['Ритм суток','День → ночь','Изменения','Обзор']){
    await page.getByRole('button',{name,exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme}/${width}/${name}`);
    await page.screenshot({path:testInfo.outputPath(`${theme}-${width}-${name}.png`),fullPage:true});
   }
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({colorScheme:'light'});
 await page.getByRole('button',{name:'Действия со статистикой'}).click();
 await page.getByRole('button',{name:/Поделиться/}).click();
 await page.getByRole('button',{name:'Создать публичную ссылку',exact:true}).click();
 const link=await page.getByRole('link',{name:'Открыть публичный отчёт'}).getAttribute('href');
 const anonymous=await browser.newContext({baseURL:new URL(page.url()).origin});const publicPage=await anonymous.newPage();
 await publicPage.goto(link);
 await publicPage.getByRole('heading',{name:'Ритм сна'}).waitFor();
 const download=publicPage.waitForEvent('download');await publicPage.getByRole('button',{name:'Скачать CSV'}).click();await download;
 await page.getByRole('button',{name:'Отозвать ссылку',exact:true}).click();
 await publicPage.reload();await publicPage.getByRole('heading',{name:'Отчёт недоступен'}).waitFor();

 assert.deepEqual(errors,[]);
 await anonymous.close();
});
