import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';

const out=process.env.ISLAVISTA_SCREENSHOTS;
const tilePattern=/^https:\/\/(?:tile\.openstreetmap\.org|server\.arcgisonline\.com|[abc]\.tile\.opentopomap\.org)\//;
async function placeList(page:Page){
  if (await page.getByRole('button',{name:'List',exact:true}).isVisible()) await page.getByRole('button',{name:'List',exact:true}).click();
  await expect(page.locator('.place-card').first()).toBeVisible();
}
async function capture(page:Page,name:string){
  if(!out)return;
  await mkdir(out,{recursive:true});
  await page.waitForLoadState('networkidle',{timeout:10000}).catch(()=>{});
  await page.screenshot({path:join(out,name+'.png'),animations:'disabled'});
}

// In environments where Chromium cannot inherit the shell CA, use the TLS-verified
// Node environment proxy for the exact individual tiles the browser requested.
test.beforeEach(async({page})=>{
  if(process.env.ISLAVISTA_TILE_FETCH==='1'){
    await page.route(tilePattern,async route=>{
      try {
        const r=await fetch(route.request().url(),{headers:{Referer:route.request().headers().referer||'http://127.0.0.1:3031/', 'User-Agent':'IslaVista local browser QA'},signal:AbortSignal.timeout(9000)});
        await route.fulfill({status:r.status,contentType:r.headers.get('content-type')||'application/octet-stream',body:Buffer.from(await r.arrayBuffer())});
      } catch {await route.abort();}
    });
  }
});
for(const [name,width,height] of [['mobile',390,844],['tablet-portrait',820,1180],['tablet-landscape',1180,820],['desktop',1440,900]] as const){
  test(`${name} renders discovery and place detail without horizontal overflow`,async({page})=>{
    await page.setViewportSize({width,height});
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/puerto-princesa');
    const map=page.getByRole('region',{name:'Interactive map'});
    await expect(map).toBeVisible();
    if(process.env.ISLAVISTA_TILE_FETCH==='1')await expect(map).toHaveAttribute('data-tiles-loaded',/^[1-9]/,{timeout:20_000});
    await expect(map.locator('.marker-cluster').first()).toBeAttached({timeout:20_000});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    await capture(page,`${name}-discovery-${width}x${height}`);
    if(width<768){
      await page.getByRole('button',{name:'Filters',exact:true}).click();
      await expect(page.getByRole('dialog',{name:'Filters'})).toBeVisible();
      await capture(page,'mobile-filters-390x844');
      await page.getByRole('button',{name:'Close filters'}).click();
    }
    await placeList(page);
    await page.getByLabel('Search places',{exact:true}).fill('Dampa sa Mansion');
    const card=page.getByRole('button',{name:/View Dampa sa Mansion/}).first();
    await expect(card).toBeVisible();
    await card.click();
    if(width>=768){
      await expect(page.getByRole('button',{name:'View Details'})).toBeVisible();
      await expect(map.locator('.marker-selected')).toBeAttached();
      await capture(page,`${name}-selected-marker-${width}x${height}`);
      await page.getByRole('button',{name:'View Details'}).click();
    }
    const panel=page.getByRole('complementary',{name:'Place details'});
    await expect(panel.getByRole('heading',{name:/Dampa sa Mansion/})).toBeVisible();
    await expect(panel.getByRole('link',{name:'Facebook'})).toHaveAttribute('href',/^https:\/\/www\.facebook\.com\//);
    await expect(panel.getByRole('link',{name:'Directions'})).toHaveAttribute('href',/^https:\/\/www\.openstreetmap\.org\/directions/);
    await capture(page,`${name}-detail-${width}x${height}`);
    await panel.getByRole('button',{name:'Save place'}).click();
    await panel.getByRole('link',{name:'Open place profile'}).click();
    await expect(page).toHaveURL(/\/place\//);
    await expect(page.locator('.profile-page h2')).toContainText('Dampa sa Mansion');
    await page.goBack();
    await expect(panel).toBeVisible();
    await panel.getByRole('button',{name:'Close details'}).click();
    await expect(page.getByLabel('Search places',{exact:true})).toHaveValue('Dampa sa Mansion');
    await page.getByRole('link',{name:'Saved places',exact:true}).click();
    await expect(page.getByRole('button',{name:/View Dampa sa Mansion/})).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('keeps the business directory distinct and filters the listings and map together',async({page})=>{
  await page.goto('/puerto-princesa');
  await placeList(page);
  await page.getByRole('button',{name:'Accommodations',exact:true}).click();
  await expect(page.locator('.place-card').first()).toContainText('Accommodations');
  await page.getByRole('button',{name:'Featured',exact:true}).click();
  await expect(page.getByRole('heading',{name:'No featured places yet'})).toBeVisible();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Directory',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Business Directory',exact:true})).toBeVisible();
  await page.getByLabel('Search places',{exact:true}).fill('1 Stop Auto Care Shop');
  await expect(page.getByRole('button',{name:'View 1 Stop Auto Care Shop'})).toBeVisible();
  await page.getByRole('button',{name:'Search this area'}).click();
  await expect(page.getByRole('region',{name:'Interactive map'}).getByRole('button',{name:'Clear map area'})).toBeVisible();
  await page.getByRole('region',{name:'Interactive map'}).getByRole('button',{name:'Clear map area'}).click();
  await expect(page.getByRole('button',{name:'View 1 Stop Auto Care Shop'})).toBeVisible();
  await page.getByRole('button',{name:'Expand map',exact:true}).click();
  await expect(page.getByRole('button',{name:'Restore map layout'})).toBeVisible();
  await page.getByRole('button',{name:'Restore map layout'}).click();
  await expect(page.getByRole('button',{name:'View 1 Stop Auto Care Shop'})).toBeVisible();
});

test('handles GPS permission granted and denied',async({page,context})=>{
  await context.setGeolocation({latitude:9.755,longitude:118.752,accuracy:21});
  await page.goto('/puerto-princesa');
  const gps=page.getByRole('button',{name:'Find my location'});
  await context.grantPermissions(['geolocation']);
  await gps.click();
  await expect(page.getByRole('status').filter({hasText:'Your location'})).toContainText('±21 m');
  await context.clearPermissions();
  await context.setGeolocation(null);
  await gps.click();
  await expect(page.getByRole('status').filter({hasText:'Location unavailable'})).toBeVisible({timeout:13_000});
});

test('supports the mobile marker sheet steps and restores the map after closing',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/puerto-princesa');
  const map=page.getByRole('region',{name:'Interactive map'});
  await expect(map).toHaveAttribute('aria-busy','false',{timeout:20000});
  const marker=await page.waitForFunction(()=>[...document.querySelectorAll<HTMLElement>('.place-marker')].find(node=>{
    const box=node.getBoundingClientRect();
    const hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
    return hit&&node.contains(hit);
  }),undefined,{timeout:20_000});
  await marker.asElement()!.click({timeout:12_000});
  await expect(page.getByRole('button',{name:'View Details'})).toBeVisible();
  await capture(page,'mobile-selected-marker-390x844');
  const grip=await page.locator('.marker-preview .sheet-grip').boundingBox();
  expect(grip).not.toBeNull();
  await page.mouse.move(grip!.x+grip!.width/2,grip!.y+12);
  await page.mouse.down();
  await page.mouse.move(grip!.x+grip!.width/2,grip!.y-76,{steps:5});
  await page.mouse.up();
  await expect(page.locator('.sheet-summary')).toBeVisible();
  await page.getByRole('button',{name:'Open full profile'}).click();
  await expect(page.locator('.sheet-full')).toBeVisible();
  await page.getByRole('button',{name:'Close details'}).click();
  await expect(map).toBeVisible();
  await expect(page.locator('.sheet-full')).toHaveCount(0);
});

test('supports pinch-to-zoom on a touch viewport',async({browser,baseURL})=>{
  const context=await browser.newContext({baseURL,viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  try{
    await page.goto('/puerto-princesa');
    const map=page.getByRole('region',{name:'Interactive map'});
    await expect(map.locator('.leaflet-control-zoom')).toBeVisible();
    const zoom=Number(await map.getAttribute('data-zoom'));
    const cdp=await context.newCDPSession(page);
    const point=(x:number,id:number)=>({x,y:472,id});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(143,0),point(247,1)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(95,0),point(295,1)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(60,0),point(330,1)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(async()=>Number(await map.getAttribute('data-zoom')),{timeout:10_000}).toBeGreaterThan(zoom);
  }finally{await context.close();}
});

test('switches providers, zooms after each switch, and respects the satellite and terrain limits',async({page,context})=>{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1LQAAAAASUVORK5CYII=','base64');
  // Keep this lifecycle test independent of tile server rate limits.
  await page.route(tilePattern,route=>route.fulfill({status:200,contentType:'image/png',body:png}));
  await page.goto('/puerto-princesa');
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  const map=page.getByRole('region',{name:'Interactive map'});
  const zoomIn=map.getByRole('button',{name:'Zoom in'});
  const zoomOut=map.getByRole('button',{name:'Zoom out'});
  const layerButton=map.locator('.map-toolbar > button');
  async function choose(name:string) {
    if(await map.getAttribute('data-basemap')!==name){
      await layerButton.click();
      await map.getByRole('button',{name,exact:true}).click();
    }
    await expect(map).toHaveAttribute('data-basemap',name);
  }
  for(const mode of ['Street','Dark','Terrain','Satellite']){
    await choose(mode);
    await expect(map.locator('img[src*="/12/"]').first()).toBeAttached();
    await zoomIn.click();
    await expect(map).toHaveAttribute('data-zoom','13');
    await expect(map.locator('img[src*="/13/"]').first()).toBeAttached();
    await zoomOut.click();
    await expect(map).toHaveAttribute('data-zoom','12');
  }
  await context.setGeolocation({latitude:9.755,longitude:118.752,accuracy:10});
  await context.grantPermissions(['geolocation']);
  await map.getByRole('button',{name:'Find my location'}).click();
  await expect(map).toHaveAttribute('data-zoom','15');
  for(let zoom=16;zoom<=19;zoom++){
    await zoomIn.click();
    await expect(map).toHaveAttribute('data-zoom',String(zoom));
  }
  await expect(map.locator('img[src*="/tile/17/"]').first()).toBeAttached();
  await expect(map.locator('img[src*="/tile/18/"],img[src*="/tile/19/"]')).toHaveCount(0);
  await choose('Terrain');
  await expect(map).toHaveAttribute('data-zoom','17');
  expect(errors).toEqual([]);
});
