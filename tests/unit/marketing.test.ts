import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {marketingServices} from '../../lib/marketing-services';
describe('focused marketing services',()=>{
 it('features agents before compact owners without invented agent profiles',()=>{
  const home=JSON.parse(readFileSync('app/page.tsx','utf8').match(/const markup = ("[^\n]*");/)![1]);
  expect(home.indexOf('id="agents"')).toBeLessThan(home.indexOf('id="people"'));
  expect(home).toContain('CONNECT WITH OUR TEAM');
  expect(home).toContain('honore-owner-card');
  expect(home).toContain('aria-labelledby="founders-title"');
  expect(home.match(/Meet the founders/g)).toHaveLength(2);
  expect(home.match(/<span>Founder<\/span>/g)).toHaveLength(2);
  expect(home).not.toContain('Meet the owners');
  expect(home).not.toContain('portrait-grid');
  expect(home).not.toContain('sharon@');
  expect(home).not.toContain('Senior Preparer');
 });
 it('ships four unique public service pages with preparation and scope',()=>{
  expect(marketingServices.map(s=>s.slug)).toEqual(['personal-taxes','business-taxes','tax-planning','irs-notices']);
  for(const s of marketingServices){expect(s.prepare.length).toBeGreaterThan(0);expect(s.includes.length).toBeGreaterThan(0);expect(s.answer.length).toBeGreaterThan(20);}
 });
 it('links every service from the homepage and sitemap',()=>{
  const home=readFileSync('app/page.tsx','utf8');const map=readFileSync('app/sitemap.ts','utf8');
  for(const s of marketingServices){expect(home).toContain(`/services/${s.slug}`);expect(map).toContain(s.slug);}
 });
 it('avoids unsupported wealth, contacts, and appointment promises',()=>{
  const home=readFileSync('app/page.tsx','utf8');const thanks=readFileSync('app/thank-you/page.tsx','utf8');
  expect(home).not.toContain('wealth-building guidance');expect(home).toContain('scope, fees, and appointment');expect(thanks).not.toContain('hello@honoretaxwealth.com');expect(thanks).not.toContain('within one business day');
 });
});
