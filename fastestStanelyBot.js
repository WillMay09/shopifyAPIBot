const puppeteer = require("puppeteer-extra");
//imports puppeteer plugin, makes it harder for websites to detect what is going on
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

const product_url =
  "https://www.stanley1913.com/products/stanley-x-jennie-quencher-luxe-tumbler-30-oz?variant=53973488009576";

async function getPage() {
  const browser = await puppeteer.launch({ headless: false });

  const page = await browser.newPage();

  return page;
}

function run() {
  const page = getPage();
}
