// integrations/telegram-bot/src/handlers/meterReading.ts
import axios from 'axios';

const API_URL = process.env.ENERLECTRA_API_URL || 'https://enerlectra-backend.onrender.com/api';

export async function handleMeterPhoto(ctx: any) {
  const photo = ctx.message?.photo?.[ctx.message.photo.length - 1];
  if (!photo) {
    await ctx.reply('No photo detected');
    return;
  }

  const userId = ctx.from?.id.toString();
  const chatId = ctx.chat?.id;

  try {
    await ctx.reply('⏳ Processing meter photo...');

    // Get file from Telegram
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    
    // TODO: OCR here
    // For now, ask user for manual input if OCR fails
    const mockOcr = { value: 0, confidence: 0 };

    // Determine meter type (ask user if not clear)
    await ctx.reply(
      'Which meter is this?\n' +
      '1️⃣ Grid (Main meter)\n' +
      '2️⃣ Solar (Production)\n' +
      '3️⃣ Unit (My consumption)',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Grid', callback_data: 'meter:grid' }],
            [{ text: 'Solar', callback_data: 'meter:solar' }],
            [{ text: 'Unit', callback_data: 'meter:unit' }]
          ]
        }
      }
    );

    // Store temporarily
    ctx.session = { 
      ...ctx.session, 
      pendingPhoto: fileLink.href,
      readingKwh: mockOcr.value 
    };

  } catch (error) {
    console.error('Photo handler error:', error);
    await ctx.reply('❌ Error processing photo. Please try /manual <reading>');
  }
}

export async function handleMeterTypeCallback(ctx: any) {
  const [type, meterType] = ctx.callbackQuery.data.split(':');
  
  if (type !== 'meter') return;

  await ctx.answerCbQuery();
  
  const userId = ctx.from?.id.toString();
  
  // TODO: Get actual cluster/unit mapping from database
  const clusterId = 'test-cluster'; // Get from user profile
  const unitId = 'A1'; // Get from user profile

  try {
    await ctx.editMessageText(`✅ Selected: ${meterType.toUpperCase()} meter\nSending to system...`);

    const response = await axios.post(`${API_URL}/readings/ingest`, {
      clusterId,
      unitId,
      userId,
      readingKwh: 0, // TODO: Get from OCR or ask user
      meterType,
      photoUrl: ctx.session?.pendingPhoto,
      confidence: 0,
      period: getCurrentPeriod()
    });

    await ctx.reply(
      `✅ *Reading Recorded*\n\n` +
      `Type: ${meterType}\n` +
      `Period: ${getCurrentPeriod()}\n` +
      `ID: ${response.data.readingId}\n\n` +
      `You will be notified when reconciliation is complete.`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    await ctx.reply('❌ Failed to save reading. Please contact support.');
  }
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
