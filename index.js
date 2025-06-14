// telegram-bot-data-scheduler.js
import { Telegraf } from 'telegraf';
import cron from 'node-cron';
import { fillLatviaEmbassyForm } from './visapp.js';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();
const { Pool } = pg;

const botToken = process.env.TELEGRAM_BOT_TOKEN;

// Initialize Telegram bot with token from environment variables
if (!botToken) {
  console.error('Error: TELEGRAM_BOT_TOKEN is undefined. Make sure your .env file or environment variables are set up.');
  process.exit(1);
}

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscribers (
        chat_id BIGINT PRIMARY KEY
      );
    `);
    console.log('Database initialized. Table "subscribers" is ready.');
  } catch (err) {
    console.error('Error creating database table:', err);
  } finally {
    client.release();
  }
}

const bot = new Telegraf(botToken);
let subscribedUsers = new Set();

async function loadSubscribers() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT chat_id FROM subscribers');
    const subscribers = result.rows.map(row => row.chat_id);
    subscribedUsers = new Set(subscribers);
    console.log(`Loaded ${subscribedUsers.size} subscribers from database`);
    client.release();
  } catch (error) {
    console.error('Error loading subscribers from database:', error.message);
  }
}

// Function to fetch data
async function fetchData() {
  try {
    const response = await fillLatviaEmbassyForm();
    return response;
  } catch (error) {
    console.error('Error fetching data:', error.message);
    return { error: 'Failed to fetch data' };
  }
}

// Format the data for display in Telegram
function formatData(data) {
  if (data === true) {
    return '🟢 Available';
  } else {
    return '🔴 Not Available';
  }
}

// Schedule to send data every minute
cron.schedule('* * * * *', async () => {
  if (subscribedUsers.size === 0) {
    return;
  }

  try {
    const data = await fetchData();
    const formattedMessage = formatData(data);
    console.log("Scheduled check, data found:", data);

    if (typeof data === "boolean" && data === false) {
      return;
    }

    for (const chatId of subscribedUsers) {
      try {
        await bot.telegram.sendMessage(chatId, formattedMessage);
        await bot.telegram.sendPhoto(chatId, { source: './embassy-booking-check.png' }, { caption: 'Embassy Booking Check' });
      } catch (err) {
        console.error(`Failed to send message to ${chatId}:`, err.message);
        if (err.message.includes('blocked') || err.message.includes('not found')) {
          subscribedUsers.delete(chatId);
          const client = await pool.connect();
          await client.query('DELETE FROM subscribers WHERE chat_id = $1', [chatId]);
          client.release();
          console.log(`Removed unsubscribed user ${chatId}`);
        }
      }
    }
  } catch (error) {
    console.error('Error in scheduled task:', error);
  }
});

// Bot commands
bot.command('start', (ctx) => {
  ctx.reply(`👋 Welcome to Data Reporter Bot!\n\nCommands:\n/subscribe - Start receiving data updates\n/unsubscribe - Stop receiving updates\n/getdata - Get data once immediately\n/status - Check subscription status`);
});

bot.command('subscribe', async (ctx) => {
  const chatId = ctx.chat.id;
  if (subscribedUsers.has(chatId)) {
    ctx.reply('You are already subscribed.');
    return;
  }
  try {
    const client = await pool.connect();
    await client.query('INSERT INTO subscribers (chat_id) VALUES ($1) ON CONFLICT (chat_id) DO NOTHING', [chatId]);
    client.release();
    subscribedUsers.add(chatId);
    ctx.reply('✅ You are now subscribed to data updates.');
    console.log(`New subscriber: ${chatId}`);
  } catch (e) {
    console.error("Subscription error:", e);
    ctx.reply('Could not subscribe due to a database error.');
  }
});

bot.command('unsubscribe', async (ctx) => {
  const chatId = ctx.chat.id;
  try {
    const client = await pool.connect();
    await client.query('DELETE FROM subscribers WHERE chat_id = $1', [chatId]);
    client.release();
    subscribedUsers.delete(chatId);
    ctx.reply('❌ You are now unsubscribed from data updates.');
    console.log(`User unsubscribed: ${chatId}`);
  } catch(e) {
    console.error("Unsubscription error:", e);
    ctx.reply('Could not unsubscribe due to a database error.');
  }
});

bot.command('getdata', async (ctx) => {
  try {
    ctx.reply('Fetching latest data...');
    const data = await fetchData();
    console.log("getdata command, data found: ", data);
    await ctx.reply(formatData(data));
    await ctx.replyWithPhoto({ source: './embassy-booking-check.png' }, { caption: 'Embassy Booking Check' });
  } catch (error) {
    ctx.reply('❌ Error fetching data');
    console.error('Error handling getdata command:', error);
  }
});

bot.command('status', (ctx) => {
  const chatId = ctx.chat.id;
  const subscribed = subscribedUsers.has(chatId);
  ctx.reply(subscribed
    ? '✅ You are currently subscribed.'
    : '❌ You are not subscribed.');
});

bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
});

async function startApp() {
  await initializeDatabase();
  await loadSubscribers();
  bot.launch(() => {
    console.log('Bot started successfully!');
  });
}

startApp();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));