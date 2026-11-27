import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

async function signIn(page:Page) {
  await page.goto('/admin');
  await page.getByLabel('Admin password').fill(process.env.ISLAVISTA_TEST_PASSWORD!);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
}
const adminNav=(page:Page,name:string)=>page.getByRole('navigation',{name:'Administration'}).getByRole('button',{name,exact:true});
const origin=(page:Page)=>new URL(page.url()).origin;

test('reviews and publishes a real editable record through the admin',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/admin');
  expect((await page.request.get('/api/businesses?admin=1')).status()).toBe(401);
  await page.getByLabel('Admin password').fill('wrong password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Incorrect admin password'})).toBeVisible();
  await signIn(page);
  await adminNav(page,'Businesses').click();
  await page.getByLabel('Search businesses').fill('Dampa sa Mansion');
  await page.getByRole('row',{name:/BIZ-FF7C829E/}).getByRole('button',{name:'Edit Dampa sa Mansion Seafood Restaurant'}).click();
  await expect(page.getByLabel('Business name')).toHaveValue('Dampa sa Mansion Seafood Restaurant');
  await page.getByLabel('Preview size').selectOption('Phone');
  await page.getByRole('button',{name:'Profile',exact:true}).click();
  await expect(page.locator('.studio-preview[data-device=phone] .place-detail')).toBeVisible();
  if(process.env.ISLAVISTA_SCREENSHOTS){
    await mkdir(process.env.ISLAVISTA_SCREENSHOTS,{recursive:true});
    await page.screenshot({path:join(process.env.ISLAVISTA_SCREENSHOTS,'desktop-admin-edit-1440x900.png')});
  }
  await page.getByLabel('Description',{exact:true}).fill('Edited in the isolated IslaVista browser test.');
  await expect(page.locator('.studio-preview')).toContainText('Edited in the isolated IslaVista browser test.');
  await page.getByRole('button',{name:'Publish',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:/published/i})).toBeVisible();
  const response=await page.request.get('/api/businesses?q=Dampa%20sa%20Mansion');
  const publicRecord=(await response.json()).businesses.find((b:{business_id:string})=>b.business_id==='BIZ-FF7C829E');
  expect(publicRecord.description).toBe('Edited in the isolated IslaVista browser test.');
  expect(publicRecord).not.toHaveProperty('source_id');
  expect(publicRecord).not.toHaveProperty('merqato_opportunity');
  const missingOrigin=await page.request.patch('/api/businesses',{data:publicRecord,headers:{Origin:'https://example.com'}});
  expect(missingOrigin.status()).toBe(403);
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
});

test('renders an approved media gallery with category data, social icons, and swipe',async({page})=>{
  await signIn(page);
  const id='QA-GALLERY-01';
  const headers={Origin:origin(page)};
  const record={business_id:id,name:'QA gallery listing',category:'Accommodation',destination:'puerto-princesa',editorial_status:'published',description:'A test-only listing for checking the full place card.',latitude:'9.75',longitude:'118.75',amenities:'Wi-Fi, Pool, Beach, Air conditioning, Parking',check_in:'2:00 PM',check_out:'11:00 AM',price_range:'₱₱',website:'https://example.com',facebook:'https://www.facebook.com/example',instagram:'https://www.instagram.com/example',tiktok:'https://www.tiktok.com/@example',whatsapp:'+639123456789',phone:'+63481234567',email:'test@example.com'};
  expect((await page.request.post('/api/businesses',{data:record,headers})).status()).toBe(200);
  for(const [index,color] of ['#124F3A','#E6B65F','#829a83'].entries()){
    const buffer=await sharp({create:{width:360,height:240,channels:3,background:color}}).png().toBuffer();
    const response=await page.request.post('/api/media',{headers,multipart:{business_id:id,permission:'approved',source:'Isolated test fixture',license:'Test-owned',type:index===0?'cover':'gallery',alt:`Media fixture ${index+1}`,file:{name:`fixture-${index}.png`,mimeType:'image/png',buffer}}});
    expect((await response.json()).imported).toBe(1);
  }
  const videoDir=await mkdtemp(join(tmpdir(),'islavista-video-e2e-'));
  try {
    const video=join(videoDir,'fixture.mp4');
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=green:s=128x96:r=12','-t','1','-pix_fmt','yuv420p','-c:v','libx264',video]);
    const uploaded=await page.request.post('/api/media',{headers,multipart:{business_id:id,permission:'approved',source:'Isolated test fixture',license:'Test-owned',alt:'Test video',file:{name:'fixture.mp4',mimeType:'video/mp4',buffer:await readFile(video)}}});
    expect((await uploaded.json()).imported).toBe(1);
  } finally {await rm(videoDir,{recursive:true,force:true});}
  await page.setViewportSize({width:390,height:844});
  await page.goto('/puerto-princesa/place/qa-gallery-listing--QA-GALLERY-01');
  await expect(page.getByRole('heading',{name:'QA gallery listing',exact:true})).toBeVisible();
  await expect(page.locator('.profile-page .gallery-frame img')).toHaveAttribute('alt','Media fixture 1');
  await expect(page.getByRole('link',{name:'WhatsApp',exact:true})).toHaveAttribute('href','https://wa.me/639123456789');
  await expect(page.getByRole('link',{name:'TikTok',exact:true})).toBeVisible();
  await expect(page.locator('.profile-page .amenities')).toContainText('Wi-Fi');
  await expect(page.getByText('Check-in',{exact:true})).toBeVisible();
  await expect(page.getByText('Check-out',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Next photo or video'}).click();
  await expect(page.locator('.profile-page .gallery-frame img')).toHaveAttribute('alt','Media fixture 2');
  const frame=page.locator('.profile-page .gallery-frame');
  await frame.scrollIntoViewIfNeeded();
  const box=(await frame.boundingBox())!;
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const touch=(x:number)=>({id:0,x:box.x+x,y:box.y+box.height*.32});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(box.width*.72)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(box.width*.35)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('.profile-page .gallery-frame img')).toHaveAttribute('alt','Media fixture 3');
  await page.getByRole('button',{name:'Open full-screen gallery'}).click();
  await expect(page.getByRole('dialog',{name:'QA gallery listing gallery'})).toBeVisible();
  await page.getByRole('button',{name:'Close full-screen gallery'}).click();
  await expect(page.getByRole('dialog',{name:'QA gallery listing gallery'})).not.toBeVisible();
  const file=await page.locator('.profile-page .gallery-frame img').getAttribute('src');
  await page.getByRole('button',{name:'Media 4',exact:true}).click();
  await expect(page.getByLabel('Test video')).toBeVisible();
  await expect.poll(()=>page.getByLabel('Test video').evaluate((video:HTMLVideoElement)=>video.duration)).toBeGreaterThan(0);
  expect((await page.request.delete('/api/businesses?id='+id,{headers})).status()).toBe(200);
  expect(file&&(await page.request.get(file)).status()).toBe(404);
});

test('publishes a destination and switches the map and listing context',async({page})=>{
  await signIn(page);
  const data=await (await page.request.get('/api/businesses?admin=1')).json();
  const headers={Origin:origin(page)};
  const destination=data.settings.destinations.find((d:{slug:string})=>d.slug==='el-nido');
  destination.status='published';
  destination.description='Isolated destination preview';
  expect((await page.request.patch('/api/settings',{headers,data:data.settings})).status()).toBe(200);
  await page.goto('/puerto-princesa');
  await expect(page.getByLabel('Destination',{exact:true})).toBeVisible();
  await page.getByLabel('Destination',{exact:true}).selectOption('el-nido');
  await expect(page).toHaveURL(/\/el-nido$/);
  await expect(page.getByRole('heading',{name:'El Nido',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Interactive map'})).toHaveAttribute('data-zoom','11');
});
