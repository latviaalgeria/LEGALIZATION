import { Telegraf } from 'telegraf';
import cron from 'node-cron';
import puppeteer from 'puppeteer'; // Import puppeteer here
import { fillLatviaEmbassyForm } from './visapp.js';
import fs from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

const DB_FILE = '/data/subscribers.json';
const SCREENSHOT_PATH = '/data/embassy-booking-check.png';
const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error('Error: TELEGRAM_BOT_TOKEN is undefined. Make sure your secrets are set.');
  process.exit(1);
}

const bot = new Telegraf(botToken);
let subscribedUsers = new Set();
let browser; // This will hold our single browser instance

async function loadSubscribers() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf8');
    subscribedUsers = new Set(JSON.parse(data));
    console.log(`Loaded ${subscribedUsers.size} subscribers from database`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No subscribers database found, creating one.');
      await saveSubscribers();
    } else {
      console.error('Error loading subscribers database:', error.message);
    }
  }
}

async function saveSubscribers() {
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(Array.from(subscribedUsers), null, 2), 'utf8');
    console.log(`Saved ${subscribedUsers.size} subscribers to database`);
  } catch (error) {
    console.error('Error saving subscribers database:', error.message);
  }
}

// fetchData now uses the global browser instance
async function fetchData() {
  if (!browser) {
    throw new Error("Browser is not initialized.");
  }
  try {
    const response = await fillLatviaEmbassyForm(browser); // Pass browser instance
    return response;
  } catch (error) {
    console.error('Error fetching data:', error.message);
    return false; // Return false on error to prevent spamming
  }
}

function formatData(data) {
  return data === true ? '🟢 Available' : '🔴 Not Available';
}

cron.schedule('* * * * *', async () => {
  if (subscribedUsers.size === 0) {
    return;
  }
  console.log("Scheduled check: Starting data fetch...");
  try {
    const data = await fetchData();
    console.log("Scheduled check result: ", data);

    if (data === true) {
      console.log("AVAILABILITY FOUND! Sending message to subscribers.");
      const formattedMessage = formatData(data);
      for (const chatId of subscribedUsers) {
        try {
          await bot.telegram.sendMessage(chatId, formattedMessage);
          await bot.telegram.sendPhoto(chatId, { source: SCREENSHOT_PATH }, { caption: 'Embassy Booking Check' });
        } catch (err) {
          console.error(`Failed to send message to ${chatId}:`, err.message);
          if (err.message.includes('blocked') || err.message.includes('not found')) {
            subscribedUsers.delete(chatId);
            await saveSubscribers();
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in scheduled task:', error);
  }
});

// Bot commands remain simple
bot.command('start', (ctx) => {
  ctx.reply(`👋 Welcome! Use /subscribe to get alerts and /unsubscribe to stop.`);
});

bot.command('subscribe', async (ctx) => {
  subscribedUsers.add(ctx.chat.id);
  await saveSubscribers();
  ctx.reply('✅ You are now subscribed. I will alert you when an appointment is available.');
});

bot.command('unsubscribe', async (ctx) => {
  subscribedUsers.delete(ctx.chat.id);
  await saveSubscribers();
  ctx.reply('❌ You are now unsubscribed.');
});

bot.command('status', (ctx) => {
  const isSubscribed = subscribedUsers.has(ctx.chat.id);
  ctx.reply(isSubscribed ? '✅ You are currently subscribed.' : '❌ You are not subscribed.');
});

// Main function to start everything
async function main() {
  await loadSubscribers();
  
  console.log("Launching single persistent browser instance...");
  try {
    browser = await puppeteer.launch({
      headless: process.env.NODE_ENV === 'production',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--start-maximized'
      ]
    });
    console.log("Browser launched successfully.");
  } catch (e) {
    console.error("Could not launch browser!", e);
    process.exit(1);
  }

  bot.launch(() => {
    console.log('Bot started successfully!');
  });
}

main();

process.once('SIGINT', async () => {
  if (browser) await browser.close();
  bot.stop('SIGINT');
});
process.once('SIGTERM', async () => {
  if (browser) await browser.close();
  bot.stop('SIGTERM');
});