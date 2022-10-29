import fs from 'fs/promises';
import { chromium } from 'playwright-chromium';
import dotenv from 'dotenv';
import { addSeconds, format, parse } from 'date-fns';

dotenv.config();

const activity = process.env.STRAVA_ACTIVITY;

const getDataFromStrava = async () => {
  console.log('Get data from strava...');
  const browser = await chromium.launch({
    channel: 'chrome-beta',
  });
  const context = await browser.newContext();
  await context.route('**/*.{png,jpg,jpeg}', (route) => route.abort());

  const page = await context.newPage();

  console.log('Login to strava...');
  await page.goto('https://www.strava.com/login');
  await page.locator('#email').fill(process.env.STRAVA_LOGIN);
  await page.locator('#password').fill(process.env.STRAVA_PASSWORD);
  await page.locator('#login-button').click();

  await page.waitForLoadState();

  console.log('Get activity info...');
  await page.goto(activity);
  const info = {
    title: await page.locator('.activity-name').textContent(),
    time: await page.locator('.details time').textContent(),
  };

  const url = (activity.endsWith('/') ? activity : activity + '/') + 'streams';
  '?stream_types[]=latlng&stream_types[]=time&stream_types[]=altitude' +
    '&stream_types[]=cadence&stream_types[]=watts' +
    '&stream_types[]=temp&stream_types[]=moving';

  const response = await page.goto(url);
  const data = await response.json();

  await context.close();
  await browser.close();

  // await fs.writeFile(
  //   'data.json',
  //   JSON.stringify(
  //     {
  //       info,
  //       data,
  //     },
  //     null,
  //     2
  //   )
  // );

  return { info, data };
};

const getDataFromFile = async () => {
  console.log('Get data from file...');
  const raw = await fs.readFile('data.json', 'utf-8');
  return JSON.parse(raw);
};

const { info, data } = await getDataFromStrava();
// const { info, data } = await getDataFromFile();

const start = parse(
  info.time.replaceAll('\n', ''),
  `hh:m a 'on' EEEE, LLLL d, yyyy`,
  new Date()
);

const steps = [];
for (let i = 0; i < data.latlng.length; i++) {
  const pt = data.latlng[i];
  const el = data.altitude?.[i];
  const sec = data.time?.[i];
  const alt = el ? `<ele>${el}</ele>` : '';
  const name = `<name>TP${i.toString().padStart(5, '0')}</name>`;
  const t = format(addSeconds(start, sec || i), `yyyy-MM-dd'T'HH:mm:ssX`);
  const time = `<time>${t}</time>`;
  steps.push(
    `    <trkpt lat="${pt[0]}" lon="${pt[1]}">${alt}${name}${time}</trkpt>`
  );
}

const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" creator="https://www.mapstogpx.com/strava" version="1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/GpxExtensions/v3 http://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd" xmlns:gpxdata="http://www.cluetrust.com/XML/GPXDATA/1/0">
 <metadata>
  <name>${info.title}</name>
  <author><name></name></author>
  <time>${format(start, `yyyy-MM-dd'T'HH:mm:ssX`)}</time>
 </metadata>
 <trk>
  <name>${info.title}</name>
  <trkseg>
${steps.join('\n')}
  </trkseg>
 </trk>
</gpx>
 `;

await fs.writeFile('export.gpx', xml);

console.log('Ok.');
