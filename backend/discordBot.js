const { Client, GatewayIntentBits, Partials, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const https = require('https');
const http = require('http');
const { v2: cloudinary } = require('cloudinary');
const Container = require('./models/Container');
const fs = require('fs');
const path = require('path');

// Store channel-container links (channelId -> { containerId, adminPassword })
const LINKS_FILE = path.join(__dirname, 'discord-links.json');
let channelLinks = {};

// Load existing links from file
const loadLinks = () => {
  try {
    if (fs.existsSync(LINKS_FILE)) {
      channelLinks = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
      console.log(`📂 Loaded ${Object.keys(channelLinks).length} Discord channel links`);
    }
  } catch (err) {
    console.error('Failed to load Discord links:', err.message);
    channelLinks = {};
  }
};

// Save links to file
const saveLinks = () => {
  try {
    fs.writeFileSync(LINKS_FILE, JSON.stringify(channelLinks, null, 2));
  } catch (err) {
    console.error('Failed to save Discord links:', err.message);
  }
};

// Download file from URL and upload to Cloudinary
const downloadAndUpload = async (url, filename, mimetype) => {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    
    proto.get(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          
          // Determine resource type
          let resourceType = 'auto';
          if (mimetype && mimetype.startsWith('video/')) {
            resourceType = 'video';
          } else if (mimetype && mimetype.startsWith('image/')) {
            resourceType = 'image';
          } else {
            resourceType = 'raw';
          }

          // Sanitize filename
          const sanitizedName = filename
            .replace(/\.[^/.]+$/, '')
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .substring(0, 100);

          // Upload to Cloudinary
          const result = await new Promise((res, rej) => {
            cloudinary.uploader.upload_stream(
              {
                folder: 'kabada-uploads',
                public_id: `${sanitizedName}_${Date.now()}`,
                resource_type: resourceType,
                use_filename: true,
                unique_filename: true
              },
              (error, result) => {
                if (error) rej(error);
                else res(result);
              }
            ).end(buffer);
          });

          resolve({
            filename: result.public_id,
            originalName: filename,
            mimetype: mimetype || 'application/octet-stream',
            size: buffer.length,
            path: result.secure_url,
            publicId: result.public_id,
            resourceType: resourceType
          });
        } catch (err) {
          reject(err);
        }
      });
      response.on('error', reject);
    }).on('error', reject);
  });
};

// Initialize Discord bot
const initDiscordBot = () => {
  const token = process.env.DISCORD_BOT_TOKEN;
  
  if (!token) {
    console.log('⚠️  DISCORD_BOT_TOKEN not set - Discord bot disabled');
    return null;
  }

  loadLinks();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Message, Partials.Channel]
  });

  // Register slash commands
  const commands = [
    new SlashCommandBuilder()
      .setName('link')
      .setDescription('Link this channel to a QuickShare container')
      .addStringOption(option =>
        option.setName('container_id')
          .setDescription('The container ID to link')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('admin_password')
          .setDescription('Admin password for write access (for read-only containers)')
          .setRequired(false)),

    new SlashCommandBuilder()
      .setName('unlink')
      .setDescription('Unlink this channel from the container'),

    new SlashCommandBuilder()
      .setName('status')
      .setDescription('Show the linked container status'),

    new SlashCommandBuilder()
      .setName('text')
      .setDescription('Write text to a clipboard')
      .addStringOption(option =>
        option.setName('content')
          .setDescription('Text content to write')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('clipboard')
          .setDescription('Clipboard name (default: first clipboard)')
          .setRequired(false)),

    new SlashCommandBuilder()
      .setName('read')
      .setDescription('Read text from a clipboard')
      .addStringOption(option =>
        option.setName('clipboard')
          .setDescription('Clipboard name (default: first clipboard)')
          .setRequired(false)),

    new SlashCommandBuilder()
      .setName('clipboards')
      .setDescription('List all clipboards in the container'),

    new SlashCommandBuilder()
      .setName('files')
      .setDescription('List all files in the container'),

    new SlashCommandBuilder()
      .setName('chat')
      .setDescription('Send a chat message to the container')
      .addStringOption(option =>
        option.setName('message')
          .setDescription('Message to send')
          .setRequired(true)),

    new SlashCommandBuilder()
      .setName('createclipboard')
      .setDescription('Create a new clipboard')
      .addStringOption(option =>
        option.setName('name')
          .setDescription('Name for the new clipboard')
          .setRequired(true)),

    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Show all available commands')
  ].map(command => command.toJSON());

  client.once('ready', async () => {
    console.log(`🤖 Discord bot logged in as ${client.user.tag}`);
    
    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(token);
    try {
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
      console.log('✅ Discord slash commands registered');
    } catch (error) {
      console.error('Failed to register slash commands:', error);
    }
  });

  // Handle slash commands
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, channelId } = interaction;
    const link = channelLinks[channelId];

    try {
      switch (commandName) {
        case 'help': {
          const embed = new EmbedBuilder()
            .setColor(0xF59E0B)
            .setTitle('📦 QuickShare Bot Commands')
            .setDescription('Control your QuickShare container directly from Discord!')
            .addFields(
              { name: '🔗 `/link <container_id> [admin_password]`', value: 'Link this channel to a container' },
              { name: '🔓 `/unlink`', value: 'Unlink this channel' },
              { name: '📊 `/status`', value: 'Show linked container info' },
              { name: '📝 `/text <content> [clipboard]`', value: 'Write text to clipboard' },
              { name: '📖 `/read [clipboard]`', value: 'Read clipboard content' },
              { name: '📋 `/clipboards`', value: 'List all clipboards' },
              { name: '➕ `/createclipboard <name>`', value: 'Create new clipboard' },
              { name: '📁 `/files`', value: 'List all files' },
              { name: '💬 `/chat <message>`', value: 'Send chat message' },
              { name: '📤 **Upload files**', value: 'Just attach files to any message!' }
            )
            .setFooter({ text: 'QuickShare • Secure file sharing' });
          await interaction.reply({ embeds: [embed] });
          break;
        }

        case 'link': {
          const containerId = interaction.options.getString('container_id');
          const adminPassword = interaction.options.getString('admin_password');

          const container = await Container.findById(containerId);
          if (!container) {
            await interaction.reply({ content: '❌ Container not found!', ephemeral: true });
            return;
          }

          // Verify admin password if container is read-only
          if (container.readOnly && adminPassword) {
            const isAdmin = await container.verifyAdminPassword(adminPassword);
            if (!isAdmin) {
              await interaction.reply({ content: '❌ Invalid admin password!', ephemeral: true });
              return;
            }
          }

          channelLinks[channelId] = {
            containerId,
            adminPassword: adminPassword || null,
            containerName: container.name,
            linkedAt: Date.now(),
            linkedBy: interaction.user.tag
          };
          saveLinks();

          const embed = new EmbedBuilder()
            .setColor(0x22C55E)
            .setTitle('✅ Channel Linked!')
            .addFields(
              { name: 'Container', value: container.name, inline: true },
              { name: 'ID', value: containerId.substring(0, 12) + '...', inline: true },
              { name: 'Access', value: adminPassword ? '🔑 Admin' : '👁️ Visitor', inline: true }
            )
            .setDescription('You can now:\n• Upload files by attaching them to messages\n• Use `/text` to write to clipboards\n• Use `/chat` to send messages')
            .setFooter({ text: `Linked by ${interaction.user.tag}` });

          await interaction.reply({ embeds: [embed] });
          break;
        }

        case 'unlink': {
          if (!link) {
            await interaction.reply({ content: '❌ This channel is not linked to any container.', ephemeral: true });
            return;
          }
          delete channelLinks[channelId];
          saveLinks();
          await interaction.reply({ content: '✅ Channel unlinked successfully!' });
          break;
        }

        case 'status': {
          if (!link) {
            await interaction.reply({ content: '❌ This channel is not linked. Use `/link` first.', ephemeral: true });
            return;
          }

          const container = await Container.findById(link.containerId);
          if (!container) {
            await interaction.reply({ content: '❌ Linked container no longer exists!', ephemeral: true });
            delete channelLinks[channelId];
            saveLinks();
            return;
          }

          const embed = new EmbedBuilder()
            .setColor(0xF59E0B)
            .setTitle(`📦 ${container.name}`)
            .addFields(
              { name: '📁 Files', value: `${container.files.length}`, inline: true },
              { name: '📋 Clipboards', value: `${container.clipboards.length}`, inline: true },
              { name: '💬 Messages', value: `${container.messages.length}`, inline: true },
              { name: '🔒 Read-Only', value: container.readOnly ? 'Yes' : 'No', inline: true },
              { name: '🔑 Access', value: link.adminPassword ? 'Admin' : 'Visitor', inline: true },
              { name: '👁️ Views', value: container.maxViews > 0 ? `${container.currentViews}/${container.maxViews}` : 'Unlimited', inline: true }
            )
            .setFooter({ text: `Linked by ${link.linkedBy}` })
            .setTimestamp(new Date(link.linkedAt));

          await interaction.reply({ embeds: [embed] });
          break;
        }

        case 'text': {
          if (!link) {
            await interaction.reply({ content: '❌ This channel is not linked. Use `/link` first.', ephemeral: true });
            return;
          }

          const content = interaction.options.getString('content');
          const clipboardName = interaction.options.getString('clipboard');

          const container = await Container.findById(link.containerId);
          if (!container) {
            await interaction.reply({ content: '❌ Container not found!', ephemeral: true });
            return;
          }

          // Check write access
          if (container.readOnly && !link.adminPassword) {
            await interaction.reply({ content: '❌ No write access. Re-link with admin password.', ephemeral: true });
            return;
          }

          // Find or use first clipboard
          let clipboard;
          if (clipboardName) {
            clipboard = container.clipboards.find(c => c.name.toLowerCase() === clipboardName.toLowerCase());
            if (!clipboard) {
              await interaction.reply({ content: `❌ Clipboard "${clipboardName}" not found!`, ephemeral: true });
              return;
            }
          } else {
            clipboard = container.clipboards[0];
            if (!clipboard) {
              // Create default clipboard
              container.clipboards.push({ name: 'Discord', content: content });
              await container.save();
              await interaction.reply({ content: `✅ Created clipboard "Discord" with your text!` });
              return;
            }
          }

          clipboard.content = content;
          clipboard.updatedAt = new Date();
          container.lastAccessed = new Date();
          await container.save();

          await interaction.reply({ content: `✅ Updated clipboard "${clipboard.name}"!` });
          break;
        }

        case 'read': {
          if (!link) {
            await interaction.reply({ content: '❌ This channel is not linked. Use `/link` first.', ephemeral: true });
            return;
          }

          const clipboardName = interaction.options.getString('clipboard');
          const container = await Container.findById(link.containerId);
          if (!container) {
            await interaction.reply({ content: '❌ Container not found!', ephemeral: true });
            return;
          }

          let clipboard;
          if (clipboardName) {
            clipboard = container.clipboards.find(c => c.name.toLowerCase() === clipboardName.toLowerCase());
          } else {
            clipboard = container.clipboards[0];
          }

          if (!clipboard) {
            await interaction.reply({ content: '❌ No clipboards found!', ephemeral: true });
            return;
          }

          const content = clipboard.content || '*Empty*';
          const embed = new EmbedBuilder()
            .setColor(0x3B82F6)
            .setTitle(`📋 ${clipboard.name}`)
            .setDescription(content.length > 4000 ? content.substring(0, 4000) + '...' : content)
            .setFooter({ text: `Last updated: ${new Date(clipboard.updatedAt).toLocaleString()}` });

          await interaction.reply({ embeds: [embed] });
          break;
        }

        case 'clipboards': {
          if (!link) {
            await interaction.reply({ content: '❌ This channel is not linked. Use `/link` first.', ephemeral: true });
            return;
          }

          const container = await Container.findById(link.containerId);
          if (!container) {
            await interaction.reply({ content: '❌ Container not found!', ephemeral: true });
            return;
          }

          if (container.clipboards.length === 0) {
            await interaction.reply({ content: '📋 No clipboards in this container.' });
            return;
          }

          const list = container.clipboards.map((c, i) => 
            `${i + 1}. **${c.name}** - ${c.content ? c.content.substring(0, 50) + (c.content.length > 50 ? '...' : '') : '*Empty*'}`
          ).join('\n');

          const embed = new EmbedBuilder()
            .setColor(0x8B5CF6)
            .setTitle('📋 Clipboards')
            .setDescription(list);

          await interaction.reply({ embeds: [embed] });
          break;
        }

        case 'createclipboard': {
          if (!link) {
            await interaction.reply({ content: '❌ This channel is not linked. Use `/link` first.', ephemeral: true });
            return;
          }

          const name = interaction.options.getString('name');
          const container = await Container.findById(link.containerId);
          if (!container) {
            await interaction.reply({ content: '❌ Container not found!', ephemeral: true });
            return;
          }

          // Check write access
          if (container.readOnly && !link.adminPassword) {
            await interaction.reply({ content: '❌ No write access. Re-link with admin password.', ephemeral: true });
            return;
          }

          // Check if name exists
          if (container.clipboards.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            await interaction.reply({ content: `❌ Clipboard "${name}" already exists!`, ephemeral: true });
            return;
          }

          container.clipboards.push({ name: name.trim(), content: '' });
          container.lastAccessed = new Date();
          await container.save();

          await interaction.reply({ content: `✅ Created clipboard "${name}"!` });
          break;
        }

        case 'files': {
          if (!link) {
            await interaction.reply({ content: '❌ This channel is not linked. Use `/link` first.', ephemeral: true });
            return;
          }

          const container = await Container.findById(link.containerId);
          if (!container) {
            await interaction.reply({ content: '❌ Container not found!', ephemeral: true });
            return;
          }

          if (container.files.length === 0) {
            await interaction.reply({ content: '📁 No files in this container.' });
            return;
          }

          const formatSize = (bytes) => {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1024 / 1024).toFixed(2) + ' MB';
          };

          const list = container.files.slice(-15).map((f, i) => 
            `${i + 1}. **${f.originalName}** (${formatSize(f.size)})`
          ).join('\n');

          const embed = new EmbedBuilder()
            .setColor(0x10B981)
            .setTitle(`📁 Files (${container.files.length})`)
            .setDescription(list + (container.files.length > 15 ? `\n\n*...and ${container.files.length - 15} more*` : ''));

          await interaction.reply({ embeds: [embed] });
          break;
        }

        case 'chat': {
          if (!link) {
            await interaction.reply({ content: '❌ This channel is not linked. Use `/link` first.', ephemeral: true });
            return;
          }

          const message = interaction.options.getString('message');
          const container = await Container.findById(link.containerId);
          if (!container) {
            await interaction.reply({ content: '❌ Container not found!', ephemeral: true });
            return;
          }

          container.messages.push({
            sender: link.adminPassword ? 'owner' : 'visitor',
            text: `[Discord] ${interaction.user.tag}: ${message}`
          });
          container.lastAccessed = new Date();
          await container.save();

          await interaction.reply({ content: `✅ Message sent!` });
          break;
        }

        default:
          await interaction.reply({ content: '❓ Unknown command', ephemeral: true });
      }
    } catch (error) {
      console.error('Discord command error:', error);
      await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true }).catch(() => {});
    }
  });

  // Handle file uploads (any message with attachments in linked channels)
  client.on('messageCreate', async (message) => {
    // Ignore bots and messages without attachments
    if (message.author.bot || message.attachments.size === 0) return;

    const link = channelLinks[message.channelId];
    if (!link) return;

    try {
      const container = await Container.findById(link.containerId);
      if (!container) {
        await message.reply('❌ Linked container no longer exists!');
        delete channelLinks[message.channelId];
        saveLinks();
        return;
      }

      // Check write access
      if (container.readOnly && !link.adminPassword) {
        await message.reply('❌ No write access to upload files. Re-link with admin password.');
        return;
      }

      const attachments = Array.from(message.attachments.values());
      await message.react('⏳');

      const uploadedFiles = [];
      for (const attachment of attachments) {
        try {
          const fileData = await downloadAndUpload(
            attachment.url,
            attachment.name,
            attachment.contentType
          );
          container.files.push(fileData);
          uploadedFiles.push(fileData);
        } catch (err) {
          console.error(`Failed to upload ${attachment.name}:`, err.message);
        }
      }

      if (uploadedFiles.length > 0) {
        container.lastAccessed = new Date();
        await container.save();

        await message.reactions.removeAll();
        await message.react('✅');

        const embed = new EmbedBuilder()
          .setColor(0x22C55E)
          .setTitle(`📤 Uploaded ${uploadedFiles.length} file(s)`)
          .setDescription(uploadedFiles.map(f => `• **${f.originalName}**`).join('\n'))
          .setFooter({ text: `To: ${container.name}` });

        await message.reply({ embeds: [embed] });
      } else {
        await message.reactions.removeAll();
        await message.react('❌');
        await message.reply('❌ Failed to upload files');
      }
    } catch (error) {
      console.error('File upload error:', error);
      await message.reply(`❌ Upload failed: ${error.message}`);
    }
  });

  // Login
  client.login(token).catch(err => {
    console.error('❌ Discord bot login failed:', err.message);
  });

  return client;
};

module.exports = { initDiscordBot };
