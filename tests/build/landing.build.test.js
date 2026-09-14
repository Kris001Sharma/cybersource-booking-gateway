import { describe, it } from "node:test";
function mockWindow() { global.window={location:{href:"http://localhost/landing",search:""},history:{replaceState:()=>{}},addEventListener:()=>{}}; global.document={getElementById:()=>({value:"",addEventListener:()=>{},style:{}}),querySelector:()=>null,querySelectorAll:()=>[],body:{innerHTML:""},head:{appendChild:()=>{}}}; global.URLSearchParams=function(s){this.get=()=>null;this.set=()=>{};}; }
describe("landing build verification", () => {
  it("render without syntax errors", async () => {
    mockWindow(); const {renderPage}=await import("../../src/pages/landing.js"); const resp=renderPage(); const html=await resp.text(); const checks=["function updateGuests","function openCalendar","function closeCalendar","function selectPricing","function scrollCarousel","function renderSignaturePackages","function renderAddOns","Our Signature Packages","Pricing options"]; for(const c of checks){if(!html.includes(c))throw new Error("Missing: "+c);}
  });
});
