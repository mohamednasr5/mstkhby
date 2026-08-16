/**
 * ===================================
 * Mstkhby - Advanced Story Cards
 * ===================================
 * 
 * Handles:
 * - Beautiful share cards generation
 * - Multiple card templates
 * - Custom branding
 * - Social media optimization
 * - Viral sharing features
 */

class StoryCardsService {
    constructor() {
        this.db = window.MstkhbyFirebase?.db;
        this.media = window.mediaApi; // R2 uploads via the Worker API (not Firebase Storage)
        
        this.templates = {
            classic: {
                id: 'classic',
                name: 'كلاسيك',
                description: 'تصميم أنيق وبسيط',
                thumbnail: '🎴',
                defaultColors: {
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    text: '#ffffff',
                    accent: '#fbbf24'
                }
            },
            modern: {
                id: 'modern',
                name: 'عصري',
                description: 'تصميم جريء وعصري',
                thumbnail: '✨',
                defaultColors: {
                    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                    text: '#ffffff',
                    accent: '#ffffff'
                }
            },
            minimal: {
                id: 'minimal',
                name: 'بسيط',
                description: 'تصميم نظيف وأنيق',
                thumbnail: '⚪',
                defaultColors: {
                    background: '#ffffff',
                    text: '#1a1a2e',
                    accent: '#0ea5e9'
                }
            },
            dark: {
                id: 'dark',
                name: 'داكن',
                description: 'مثالي للصور الداكنة',
                thumbnail: '🌙',
                defaultColors: {
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                    text: '#ffffff',
                    accent: '#e94560'
                }
            },
            gold: {
                id: 'gold',
                name: 'ذهبي',
                description: 'للمشاهير والموثقين',
                thumbnail: '👑',
                defaultColors: {
                    background: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
                    text: '#1a1a2e',
                    accent: '#1a1a2e'
                },
                premiumOnly: true
            },
            neon: {
                id: 'neon',
                name: 'نيون',
                description: 'ألوان نيون متوهجة',
                thumbnail: '💜',
                defaultColors: {
                    background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
                    text: '#ffffff',
                    accent: '#00ff87'
                }
            }
        };

        this.sizes = {
            instagram: { width: 1080, height: 1080, aspectRatio: '1:1' },
            story: { width: 1080, height: 1920, aspectRatio: '9:16' },
            twitter: { width: 1200, height: 675, aspectRatio: '16:9' },
            facebook: { width: 1200, height: 630, aspectRatio: '1.91:1' },
            custom: { width: 800, height: 800, aspectRatio: '1:1' }
        };

        this.init();
    }

    init() {
        // Preload fonts for canvas rendering
        this.loadFonts();
    }

    /**
     * Load fonts for canvas
     */
    async loadFonts() {
        try {
            await document.fonts.load('700 32px Cairo');
            await document.fonts.load('400 18px Cairo');
            console.log('✅ Fonts loaded for Story Cards');
        } catch (error) {
            console.warn('Font loading warning:', error);
        }
    }

    /**
     * Generate a story card from message data
     */
    async generateCard(messageData, options = {}) {
        const {
            templateId = 'classic',
            size = 'instagram',
            showSenderType = true,
            showReply = false,
            replyText = '',
            customBranding = null,
            includeQRCode = false,
            watermark = true
        } = options;

        const template = this.templates[templateId] || this.templates.classic;
        const sizeConfig = this.sizes[size] || this.sizes.instagram;

        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = sizeConfig.width;
        canvas.height = sizeConfig.height;
        
        const ctx = canvas.getContext('2d');

        // Draw background
        await this.drawBackground(ctx, canvas, template);

        // Draw content
        await this.drawCardContent(ctx, canvas, messageData, template, {
            showSenderType,
            showReply,
            replyText,
            customBranding,
            includeQRCode,
            watermark
        });

        // Convert to blob/image
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1.0));
        const url = URL.createObjectURL(blob);

        return {
            canvas,
            blob,
            url,
            width: sizeConfig.width,
            height: sizeConfig.height,
            template: template.name,
            size
        };
    }

    /**
     * Draw card background
     */
    async drawBackground(ctx, canvas, template) {
        const { width, height } = canvas;

        if (template.defaultColors.background.includes('gradient')) {
            // Parse gradient
            const gradientMatch = template.defaultColors.background.match(/linear-gradient\((\d+)deg,\s*(.+)\)/);
            
            if (gradientMatch) {
                const angle = parseInt(gradientMatch[1]);
                const colors = gradientMatch[2].split(',').map(c => c.trim());
                
                // Convert angle to coordinates
                const radian = (angle - 90) * Math.PI / 180;
                const centerX = width / 2;
                const centerY = height / 2;
                const length = Math.sqrt(width * width + height * height) / 2;
                
                const x1 = centerX - Math.cos(radian) * length;
                const y1 = centerY - Math.sin(radian) * length;
                const x2 = centerX + Math.cos(radian) * length;
                const y2 = centerY + Math.sin(radian) * length;

                const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
                
                colors.forEach((colorStop, index) => {
                    const [color, position] = colorStop.split(' ');
                    // "100%" -> 1.0, not 100 — addColorStop requires 0.0-1.0
                    const stop = position
                        ? parseFloat(position) / 100
                        : index / (colors.length - 1);
                    gradient.addColorStop(stop, color);
                });

                ctx.fillStyle = gradient;
            }
        } else {
            ctx.fillStyle = template.defaultColors.background;
        }

        // Rounded rectangle
        this.roundRect(ctx, 0, 0, width, height, 40);
        ctx.fill();

        // Add subtle pattern/texture
        this.addPattern(ctx, canvas, template);
    }

    /**
     * Draw card content
     */
    async drawCardContent(ctx, canvas, messageData, template, options) {
        const { width, height } = canvas;
        const padding = width * 0.08;

        // Platform logo/badge at top
        this.drawPlatformBadge(ctx, padding, padding, template);

        // Message bubble
        const bubbleY = height * 0.15;
        this.drawMessageBubble(ctx, padding, bubbleY, width - padding * 2, height * 0.5, messageData, template);

        // Sender type badge
        if (options.showSenderType) {
            this.drawSenderBadge(ctx, width / 2, height * 0.7, messageData.identity, template);
        }

        // Reply section
        if (options.showReply && options.replyText) {
            this.drawReplySection(ctx, padding, height * 0.78, width - padding * 2, options.replyText, template);
        }

        // Recipient info
        this.drawRecipientInfo(ctx, padding, height * 0.88, messageData.recipientName, template);

        // CTA / QR Code — sized generously so it's actually scannable
        // once the card is shared/downloaded and viewed at normal size.
        if (options.includeQRCode) {
            const qrSize = Math.round(width * 0.16);
            await this.drawQRCode(ctx, width - padding - qrSize, height - padding - qrSize, qrSize, messageData.profileUrl);
        }

        // Watermark
        if (options.watermark) {
            this.drawWatermark(ctx, width, height, template);
        }
    }

    /**
     * Draw platform badge
     */
    drawPlatformBadge(ctx, x, y, template) {
        ctx.save();
        
        // Background circle
        ctx.beginPath();
        ctx.arc(x + 25, y + 25, 30, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fill();

        // Icon
        ctx.font = '28px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('🤫', x + 25, y + 27);

        // Text
        ctx.font = 'bold 20px Cairo';
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillText('مستخبي', x + 65, y + 32);

        ctx.restore();
    }

    /**
     * Draw message bubble
     */
    drawMessageBubble(ctx, x, y, w, h, messageData, template) {
        ctx.save();

        // Bubble background
        ctx.beginPath();
        this.roundRect(ctx, x, y, w, h, 24);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Message text with word wrapping
        ctx.fillStyle = template.defaultColors.text;
        ctx.font = `${w > 600 ? '36px' : '28px'} Cairo`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const maxWidth = w - 60;
        const lines = this.wrapText(ctx, messageData.content, maxWidth);
        const lineHeight = 1.4;
        const totalHeight = lines.length * lineHeight * parseInt(ctx.font);
        const startY = y + (h - totalHeight) / 2;

        lines.forEach((line, index) => {
            ctx.fillText(line, x + w / 2, startY + index * lineHeight * parseInt(ctx.font));
        });

        ctx.restore();
    }

    /**
     * Draw sender identity badge
     */
    drawSenderBadge(ctx, x, y, identity, template) {
        const badges = {
            anonymous: { icon: '🤫', text: 'رسالة مجهولة', color: '#8b5cf6' },
            alias: { icon: '🎭', text: 'رسالة باسم مستعار', color: '#f97316' },
            reveal: { icon: '👤', text: 'رسالة معروفة', color: '#10b981' }
        };

        const badge = badges[identity] || badges.anonymous;

        ctx.save();

        // Badge background
        const badgeWidth = 280;
        const badgeHeight = 50;
        
        ctx.beginPath();
        this.roundRect(ctx, x - badgeWidth / 2, y - badgeHeight / 2, badgeWidth, badgeHeight, 25);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fill();

        // Icon and text
        ctx.font = '24px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(badge.icon, x - badgeWidth / 2 + 20, y);

        ctx.font = 'bold 20px Cairo';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(badge.text, x - badgeWidth / 2 + 60, y);

        ctx.restore();
    }

    /**
     * Draw reply section
     */
    drawReplySection(ctx, x, y, w, replyText, template) {
        ctx.save();

        // Reply indicator
        ctx.beginPath();
        this.roundRect(ctx, x, y, w, 70, 20);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
        ctx.fill();

        // Reply arrow and text
        ctx.font = '18px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('↩️', x + w - 20, y + 35);

        ctx.font = '20px Cairo';
        ctx.fillStyle = '#10b981';
        const maxReplyWidth = w - 80;
        let replyDisplayText = replyText;
        if (ctx.measureText(replyText).width > maxReplyWidth) {
            replyDisplayText = replyText.substring(0, 30) + '...';
        }
        ctx.fillText(`"${replyDisplayText}"`, x + w - 55, y + 35);

        ctx.restore();
    }

    /**
     * Draw recipient info
     */
    drawRecipientInfo(ctx, x, y, recipientName, template) {
        ctx.save();

        ctx.font = 'bold 22px Cairo';
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillText(`${recipientName} ينتظر رسائلك!`, x + 400, y);

        // Profile URL
        ctx.font = '18px Cairo';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillText('mstkhby.com/' + recipientName, x + 400, y + 30);

        ctx.restore();
    }

    /**
     * Draw a real, scannable QR code (using the `qrcode` library — loaded
     * via CDN as window.QRCode) that encodes the recipient's public
     * profile link, so scanning it takes people straight to the page
     * where they can send this person a message.
     */
    async drawQRCode(ctx, x, y, size, url) {
        ctx.save();

        // White rounded card behind the QR for contrast/quiet-zone
        this.roundRect(ctx, x, y, size, size, 12);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        const targetUrl = this.normalizeProfileUrl(url);
        const qrPadding = size * 0.1;
        const qrSize = Math.round(size - qrPadding * 2);

        try {
            const qrImage = await this.renderQRCodeImage(targetUrl, qrSize);
            ctx.drawImage(qrImage, x + qrPadding, y + qrPadding, qrSize, qrSize);
        } catch (error) {
            console.warn('QR code generation failed, falling back to placeholder:', error);
            this.drawQRCodePlaceholder(ctx, x + qrPadding, y + qrPadding, qrSize);
        }

        ctx.restore();
    }

    /**
     * Ensure the encoded URL is a full, absolute link (adds https:// if
     * the caller only passed a bare domain/path like "mstkhby.com/user").
     */
    normalizeProfileUrl(url) {
        if (!url) return window.location.origin;
        return /^https?:\/\//i.test(url) ? url : `https://${url}`;
    }

    /**
     * Render a QR code for `text` at `size`px into an offscreen <img>,
     * using the `qrcode` UMD library (window.QRCode). Resolves with an
     * Image ready to be drawn onto the card canvas.
     */
    renderQRCodeImage(text, size) {
        return new Promise((resolve, reject) => {
            if (!window.QRCode || typeof window.QRCode.toDataURL !== 'function') {
                reject(new Error('QRCode library not loaded'));
                return;
            }

            window.QRCode.toDataURL(text, {
                width: size,
                margin: 0,
                color: { dark: '#000000ff', light: '#ffffffff' },
                errorCorrectionLevel: 'M'
            }, (err, dataUrl) => {
                if (err) {
                    reject(err);
                    return;
                }
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = dataUrl;
            });
        });
    }

    /**
     * Fallback visual (not a real scannable QR) used only if the QR
     * library failed to load, so the card still renders something.
     */
    drawQRCodePlaceholder(ctx, x, y, size) {
        ctx.save();
        ctx.fillStyle = '#000000';
        const moduleSize = size / 21;

        this.drawQRCornerPattern(ctx, x + 3*moduleSize, y + 3*moduleSize, 7*moduleSize);
        this.drawQRCornerPattern(ctx, x + 11*moduleSize, y + 3*moduleSize, 7*moduleSize);
        this.drawQRCornerPattern(ctx, x + 3*moduleSize, y + 11*moduleSize, 7*moduleSize);

        for (let i = 0; i < 200; i++) {
            const px = x + Math.random() * (size - 20) + 10;
            const py = y + Math.random() * (size - 20) + 10;
            ctx.fillRect(px, py, moduleSize - 1, moduleSize - 1);
        }
        ctx.restore();
    }

    /**
     * Draw QR corner pattern
     */
    drawQRCornerPattern(ctx, x, y, size) {
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
        ctx.fillStyle = '#000000';
        ctx.fillRect(x + 4, y + 4, size - 8, size - 8);
    }

    /**
     * Draw watermark
     */
    drawWatermark(ctx, width, height, template) {
        ctx.save();
        
        ctx.font = '14px Cairo';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillText('mstkhby.com', width / 2, height - 20);

        ctx.restore();
    }

    /**
     * Add subtle pattern overlay
     */
    addPattern(ctx, canvas, template) {
        // Optional: add dots, noise, or other patterns
        // This adds visual depth to the card
    }

    /**
     * Create rounded rectangle path
     */
    roundRect(ctx, x, y, width, height, radius) {
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    /**
     * Wrap text to fit within max width
     */
    wrapText(ctx, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        words.forEach(word => {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        });

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines;
    }

    /**
     * Show card preview modal
     */
    async showPreview(messageData, options = {}) {
        const modalId = 'cardPreviewModal';
        
        // Check if modal exists
        let modal = document.getElementById(modalId);
        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal card-preview-modal" style="max-width: 90vw; max-height: 90vh;">
                    <button class="modal-close" onclick="document.getElementById('${modalId}').remove();">&times;</button>
                    
                    <div class="card-preview-header">
                        <h3>معاينة البطاقة</h3>
                        <div class="template-selector">
                            ${Object.values(this.templates).map(t => 
                                `<button class="template-btn" data-template="${t.id}" title="${t.name}">${t.thumbnail}</button>`
                            ).join('')}
                        </div>
                        <div class="size-selector">
                            ${Object.entries(this.sizes).map(([key, val]) => 
                                `<button class="size-btn" data-size="${key}">${val.aspectRatio}</button>`
                            ).join('')}
                        </div>
                    </div>
                    
                    <div class="card-preview-container" id="cardPreviewContainer">
                        <div class="loading-spinner">جاري إنشاء البطاقة...</div>
                    </div>
                    
                    <div class="card-preview-actions">
                        <button class="btn btn-primary" id="downloadCardBtn">📥 تحميل</button>
                        <button class="btn btn-outline" id="shareCardBtn">📤 مشاركة</button>
                        <button class="btn btn-ghost" onclick="document.getElementById('${modalId}').remove()">إغلاق</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        // Show modal
        modal.classList.add('active');

        // Generate initial preview
        await this.updatePreview(messageData, options);

        // Bind events
        this.bindPreviewEvents(modal, messageData, options);

        return modal;
    }

    /**
     * Update card preview
     */
    async updatePreview(messageData, options) {
        const container = document.getElementById('cardPreviewContainer');
        if (!container) return;

        container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

        try {
            const card = await this.generateCard(messageData, options);
            
            container.innerHTML = `
                <img src="${card.url}" alt="Story Card Preview" style="
                    max-width: 100%;
                    max-height: 70vh;
                    border-radius: 12px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                ">
            `;

            // Store current card for download/share
            this.currentCard = card;

        } catch (error) {
            container.innerHTML = `<p style="color: #ef4444;">خطأ في إنشاء البطاقة: ${error.message}</p>`;
        }
    }

    /**
     * Bind preview modal events
     */
    bindPreviewEvents(modal, messageData, baseOptions) {
        // Template selection
        modal.querySelectorAll('.template-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.template-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updatePreview(messageData, { ...baseOptions, templateId: btn.dataset.template });
            });
        });

        // Size selection
        modal.querySelectorAll('.size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updatePreview(messageData, { ...baseOptions, size: btn.dataset.size });
            });
        });

        // Download button
        document.getElementById('downloadCardBtn')?.addEventListener('click', () => {
            this.downloadCurrentCard();
        });

        // Share button
        document.getElementById('shareCardBtn')?.addEventListener('click', () => {
            this.shareCurrentCard();
        });
    }

    /**
     * Download current card
     */
    async downloadCurrentCard() {
        if (!this.currentCard) return;

        try {
            const link = document.createElement('a');
            link.download = `mstkhby-card-${Date.now()}.png`;
            link.href = this.currentCard.url;
            link.click();

            window.uiManager?.showToast(
                'تم التحميل',
                'تم تحميل بطاقتك بنجاح!',
                'success'
            );
        } catch (error) {
            window.uiManager?.showToast('خطأ', 'فشل تحميل البطاقة', 'error');
        }
    }

    /**
     * Share current card
     */
    async shareCurrentCard() {
        if (!this.currentCard) return;

        try {
            // Convert blob to file for sharing
            const file = new File([this.currentCard.blob], 'mstkhby-card.png', { type: 'image/png' });

            if (navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: 'رسالة سرية من مستخبي 🤫',
                    files: [file],
                    text: 'استلمت رسالة سرية عبر منصة مستخبي!'
                });
            } else {
                // Fallback: copy to clipboard or open in new tab
                window.open(this.currentCard.url, '_blank');
            }

        } catch (error) {
            console.error('Share error:', error);
            window.uiManager?.showToast('خطأ', 'فشل مشاركة البطاقة', 'error');
        }
    }

    /**
     * Quick share - generate and share immediately
     */
    async quickShare(messageData) {
        try {
            const card = await this.generateCard(messageData, {
                templateId: 'modern',
                size: 'instagram'
            });

            // Auto-share
            if (navigator.share) {
                const file = new File([card.blob], 'mstkhby-card.png', { type: 'image/png' });
                await navigator.share({
                    title: '🤫 رسالة سرية',
                    files: [file]
                });
            } else {
                window.open(card.url, '_blank');
            }

            return { success: true };

        } catch (error) {
            console.error('Quick share error:', error);
            throw error;
        }
    }

    /**
     * Batch generate cards for multiple messages
     */
    async batchGenerateCards(messagesArray, options = {}) {
        const cards = [];
        
        for (const msg of messagesArray) {
            try {
                const card = await this.generateCard(msg, options);
                cards.push({ success: true, card, messageId: msg.id });
            } catch (error) {
                cards.push({ success: false, error, messageId: msg.id });
            }
        }

        return cards;
    }

    /**
     * Get available templates
     */
    getTemplates(userPlan = 'free') {
        return Object.values(this.templates).filter(template => {
            if (template.premiumOnly && userPlan === 'free') return false;
            return true;
        });
    }

    /**
     * Get available sizes
     */
    getSizes() {
        return this.sizes;
    }
}

// Initialize and export
window.storyCardsService = new StoryCardsService();
console.log('🎴 Story Cards service initialized');
