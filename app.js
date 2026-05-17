// 应用主逻辑
class KaomojiApp {
    constructor() {
        this.currentCategory = 'all';
        this.favorites = JSON.parse(localStorage.getItem('kaomoji-favorites') || '[]');
        this.kaomojiColor = '#333333';
        this.canvas = null;
        this.ctx = null;
        this.image = null;
        this.rotation = 0;
        this.scale = 1;
        this.elements = [];
        this.selectedElement = null;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.isCropMode = false;
        this.cropArea = null;
        this.cropRatio = 'free';
        this.pendingImport = null;
        this.isElementCropMode = false;
        this.elementCropTarget = null;
        this.currentCategory = 'favorites';

        this.init();
    }

        init() {
        this.loadCustomCategories();
        this.loadCategoryOrder();
        this.bindEvents();
        this.renderKaomojiGrid();
        this.initKaomojiSelector();
    }

    initCategoryDragScroll() {
        const tabs = document.querySelector('.category-tabs');
        if (!tabs) return;

        let isDown = false;
        let startX;
        let scrollLeft;

        tabs.addEventListener('mousedown', (e) => {
            isDown = true;
            tabs.classList.add('active');
            startX = e.pageX - tabs.offsetLeft;
            scrollLeft = tabs.scrollLeft;
        });

        tabs.addEventListener('mouseleave', () => {
            isDown = false;
            tabs.classList.remove('active');
        });

        tabs.addEventListener('mouseup', () => {
            isDown = false;
            tabs.classList.remove('active');
        });

        tabs.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - tabs.offsetLeft;
            const walk = (x - startX) * 2;
            tabs.scrollLeft = scrollLeft - walk;
        });

            // 触摸支持 - 优化滑动体验
        let touchStartX = 0;
        let touchScrollLeft = 0;
        let isTouching = false;

        tabs.addEventListener('touchstart', (e) => {
            isTouching = true;
            touchStartX = e.touches[0].pageX;
            touchScrollLeft = tabs.scrollLeft;
            tabs.style.scrollBehavior = 'auto';
        }, { passive: true });

        tabs.addEventListener('touchmove', (e) => {
            if (!isTouching) return;
            const touchX = e.touches[0].pageX;
            const walk = touchStartX - touchX;
            tabs.scrollLeft = touchScrollLeft + walk;
        }, { passive: true });

        tabs.addEventListener('touchend', () => {
            isTouching = false;
            tabs.style.scrollBehavior = 'smooth';
        }, { passive: true });

        tabs.addEventListener('touchcancel', () => {
            isTouching = false;
            tabs.style.scrollBehavior = 'smooth';
        }, { passive: true });
    }

    saveCategoryOrder() {
        const tabs = document.querySelector('.category-tabs');
        if (!tabs) return;

        const order = [...tabs.querySelectorAll('.cat-btn')].map(btn => btn.dataset.category);
        localStorage.setItem('kaomoji-category-order', JSON.stringify(order));
    }

    loadCategoryOrder() {
        const saved = localStorage.getItem('kaomoji-category-order');
        if (!saved) return;

        try {
            const order = JSON.parse(saved);
            const tabs = document.querySelector('.category-tabs');
            if (!tabs) return;

            const allBtns = [...tabs.querySelectorAll('.cat-btn')];
            const orderedBtns = [];

            // 先按保存的顺序添加
            order.forEach(category => {
                const btn = allBtns.find(b => b.dataset.category === category);
                if (btn) {
                    orderedBtns.push(btn);
                }
            });

            // 再把不在 order 中的新标签追加到末尾
            allBtns.forEach(btn => {
                if (!order.includes(btn.dataset.category)) {
                    orderedBtns.push(btn);
                }
            });

            // 按顺序重新插入
            orderedBtns.forEach(btn => {
                tabs.appendChild(btn);
            });
        } catch (e) {
            console.error('加载分类顺序失败', e);
        }
    }

    updateCategorySelect() {
        const select = document.getElementById('manual-category-select');
        if (!select) return;

        select.innerHTML = '';

        // 动态从 kaomojiData 读取所有标签（排除内置的 custom，保留用户创建的 custom_xxx）
        for (const key in kaomojiData) {
            if (key !== 'custom') {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = kaomojiData[key].name;
                select.appendChild(option);
            }
        }
    }
    createNewCategory(name) {
        const id = 'custom_' + Date.now();
        kaomojiData[id] = {
            name: name,
            items: []
        };

        this.updateCategorySelect();

        // 添加到分类栏
        const tabs = document.querySelector('.category-tabs');
        const sortBtn = document.getElementById('btn-sort-toggle');
        const newBtn = document.getElementById('btn-new-category');

        const catBtn = document.createElement('button');
        catBtn.className = 'cat-btn';
        catBtn.dataset.category = id;
        catBtn.textContent = name;

        tabs.insertBefore(catBtn, sortBtn);

        // 添加点击事件
        catBtn.addEventListener('click', (e) => {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            catBtn.classList.add('active');
            this.currentCategory = id;
            this.renderKaomojiGrid();
        });

        // 保存自定义分类
        this.saveCustomCategories();

        // 切换到新分类
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        catBtn.classList.add('active');
        this.currentCategory = id;
        this.renderKaomojiGrid();

        this.showToast(`已创建「${name}」分类！`);
    }

    deleteCategory(categoryId) {
        if (!categoryId.startsWith('custom_')) {
            this.showToast('系统组不能删除！');
            return;
        }

        delete kaomojiData[categoryId];

        // 从分类栏移除
        const btn = document.querySelector(`.cat-btn[data-category="${categoryId}"]`);
        if (btn) btn.remove();

        // 保存
        this.saveCustomCategories();

        // 如果当前正在查看这个分类，切换到我的收藏
        if (this.currentCategory === categoryId) {
            this.currentCategory = 'favorites';
            document.querySelectorAll('.cat-btn').forEach(b => {
                b.classList.remove('active');
                if (b.dataset.category === 'favorites') {
                    b.classList.add('active');
                }
            });
            this.renderKaomojiGrid();
        }

        this.updateCategorySelect();
        this.showToast('已删除该组');
    }

    renderGroupList() {
        const list = document.getElementById('group-list');
        if (!list) return;

        list.innerHTML = '';

        const tabs = document.querySelector('.category-tabs');
        const groups = [...tabs.querySelectorAll('.cat-btn')].map(btn => ({
            id: btn.dataset.category,
            name: btn.textContent,
            isSystem: !btn.dataset.category.startsWith('custom_')
        }));

        groups.forEach((group, index) => {
            const item = document.createElement('div');
            item.className = 'group-item';
            item.draggable = true;
            item.dataset.category = group.id;
            item.dataset.index = index;

            item.innerHTML = `
                <span class="group-item-handle">☰</span>
                <span class="group-item-name">${group.name}</span>
                <button class="group-item-delete" ${group.isSystem ? 'disabled' : ''}>
                    ${group.isSystem ? '系统' : '删除'}
                </button>
            `;

            // 删除按钮
            if (!group.isSystem) {
                item.querySelector('.group-item-delete').addEventListener('click', () => {
                    if (confirm(`确定要删除「${group.name}」组吗？组内的颜文字也会一并删除。`)) {
                        this.deleteCategory(group.id);
                        this.renderGroupList();
                    }
                });
            }

                        // 拖拽排序（桌面端）
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index);
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const toIndex = parseInt(item.dataset.index);

                if (fromIndex !== toIndex) {
                    this.reorderCategory(fromIndex, toIndex);
                    this.renderGroupList();
                }
            });

            // 触摸拖拽排序（手机端）
            let touchDragItem = null;
            let touchDragIndex = -1;
            let touchClone = null;
            let touchStartY = 0;
            let touchCurrentItem = null;

            item.addEventListener('touchstart', (e) => {
                const handle = item.querySelector('.group-item-handle');
                if (!handle || !e.target.closest('.group-item-handle')) return;

                touchDragItem = item;
                touchDragIndex = index;
                touchStartY = e.touches[0].clientY;

                // 创建拖拽副本
                touchClone = item.cloneNode(true);
                touchClone.style.position = 'fixed';
                touchClone.style.zIndex = '9999';
                touchClone.style.width = item.offsetWidth + 'px';
                touchClone.style.opacity = '0.8';
                touchClone.style.pointerEvents = 'none';
                touchClone.style.backgroundColor = 'var(--primary)';
                touchClone.style.color = 'white';
                touchClone.style.borderRadius = '10px';
                touchClone.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
                const rect = item.getBoundingClientRect();
                touchClone.style.left = rect.left + 'px';
                touchClone.style.top = rect.top + 'px';
                document.body.appendChild(touchClone);

                item.style.opacity = '0.3';
                e.preventDefault();
            }, { passive: false });

            item.addEventListener('touchmove', (e) => {
                if (!touchDragItem || !touchClone) return;
                e.preventDefault();

                const touch = e.touches[0];
                const rect = touchDragItem.getBoundingClientRect();
                touchClone.style.top = (touch.clientY - rect.height / 2) + 'px';

                // 找到当前悬停的元素
                touchClone.style.display = 'none';
                const elem = document.elementFromPoint(touch.clientX, touch.clientY);
                touchClone.style.display = '';

                if (elem) {
                    const groupItem = elem.closest('.group-item');
                    if (groupItem && groupItem !== touchDragItem) {
                        if (touchCurrentItem) touchCurrentItem.style.borderTop = '';
                        touchCurrentItem = groupItem;
                        touchCurrentItem.style.borderTop = '3px solid var(--primary)';
                    }
                }
            }, { passive: false });

            item.addEventListener('touchend', (e) => {
                if (!touchDragItem) return;

                if (touchClone) {
                    touchClone.remove();
                    touchClone = null;
                }

                touchDragItem.style.opacity = '';

                if (touchCurrentItem && touchCurrentItem !== touchDragItem) {
                    const toIndex = parseInt(touchCurrentItem.dataset.index);
                    if (touchDragIndex !== toIndex) {
                        this.reorderCategory(touchDragIndex, toIndex);
                        this.renderGroupList();
                    }
                }

                if (touchCurrentItem) touchCurrentItem.style.borderTop = '';
                touchDragItem = null;
                touchDragIndex = -1;
                touchCurrentItem = null;
            }, { passive: true });

            list.appendChild(item);
        });
    }

    reorderCategory(fromIndex, toIndex) {
        const tabs = document.querySelector('.category-tabs');
        const buttons = [...tabs.querySelectorAll('.cat-btn')];
        const manageBtn = document.getElementById('btn-cat-manage');

        const movedBtn = buttons[fromIndex];
        const targetBtn = buttons[toIndex];

        if (fromIndex < toIndex) {
            tabs.insertBefore(movedBtn, targetBtn.nextSibling);
        } else {
            tabs.insertBefore(movedBtn, targetBtn);
        }

        this.saveCategoryOrder();
    }

    saveCustomCategories() {
        const customCats = {};
        for (const key in kaomojiData) {
            if (key.startsWith('custom_')) {
                customCats[key] = {
                    name: kaomojiData[key].name,
                    items: kaomojiData[key].items
                };
            }
        }
        localStorage.setItem('kaomoji-custom-categories', JSON.stringify(customCats));
    }

    loadCustomCategories() {
        const saved = localStorage.getItem('kaomoji-custom-categories');
        if (!saved) return;

        try {
            const customCats = JSON.parse(saved);
            for (const key in customCats) {
                kaomojiData[key] = customCats[key];

                const tabs = document.querySelector('.category-tabs');
                const sortBtn = document.getElementById('btn-sort-toggle');

                const catBtn = document.createElement('button');
                catBtn.className = 'cat-btn';
                catBtn.dataset.category = key;
                catBtn.textContent = customCats[key].name;

                tabs.insertBefore(catBtn, sortBtn);

                catBtn.addEventListener('click', (e) => {
                    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
                    catBtn.classList.add('active');
                    this.currentCategory = key;
                    this.renderKaomojiGrid();
                });
            }
            this.updateCategorySelect();
        } catch (e) {
            console.error('加载自定义分类失败', e);
        }
    }

    bindEvents() {
        // 导航切换
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                const tab = e.target.dataset.tab;
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.getElementById(`${tab}-section`).classList.add('active');
            });
        });

        // 分类切换
        document.querySelectorAll('.cat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentCategory = e.target.dataset.category;
                this.renderKaomojiGrid();
            });
        });

        // 分类栏拖动滚动
        this.initCategoryDragScroll();

        // 标签组管理
        document.getElementById('btn-cat-manage').addEventListener('click', () => {
            document.getElementById('cat-manage-modal').classList.remove('hidden');
            this.renderGroupList();
        });

        document.getElementById('btn-create-group').addEventListener('click', () => {
            const name = document.getElementById('new-group-name').value.trim();
            if (!name) {
                this.showToast('请输入组名！');
                return;
            }
            this.createNewCategory(name);
            document.getElementById('new-group-name').value = '';
            this.renderGroupList();
        });

        // 添加按钮切换
        document.getElementById('btn-toggle-add').addEventListener('click', () => {
            const box = document.getElementById('manual-add-box');
            const btn = document.getElementById('btn-toggle-add');
            box.classList.toggle('hidden');
            btn.classList.toggle('active');
        });

        // 图片上传
        document.getElementById('image-upload').addEventListener('change', (e) => {
            this.handleImageUpload(e);
        });

        // 旋转
        document.getElementById('btn-rotate-right').addEventListener('click', () => {
            this.rotateImage(90);
        });

        // 裁剪模式
        document.getElementById('btn-crop').addEventListener('click', () => {
            this.toggleCropMode();
        });

        // 裁剪比例
        document.querySelectorAll('#crop-toolbar .crop-ratio-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#crop-toolbar .crop-ratio-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.cropRatio = e.target.dataset.ratio;
                if (this.isCropMode && this.cropArea) {
                    this.updateCropRatio();
                }
            });
        });

        // 裁剪操作按钮
        document.getElementById('btn-crop-cancel').addEventListener('click', () => {
            this.cancelCrop();
        });
        document.getElementById('btn-crop-confirm').addEventListener('click', () => {
            this.confirmCrop();
        });

        // 添加文字
        document.getElementById('btn-add-text').addEventListener('click', () => {
            this.showTextModal();
        });

        // 添加颜文字
        document.getElementById('btn-add-kaomoji').addEventListener('click', () => {
            this.showKaomojiModal();
        });

        // 元素编辑控制
        document.getElementById('element-scale').addEventListener('input', (e) => {
            this.updateElementScale(parseInt(e.target.value));
        });

        document.getElementById('element-rotate').addEventListener('input', (e) => {
            this.updateElementRotate(parseInt(e.target.value));
        });

        document.getElementById('element-stretch-x').addEventListener('input', (e) => {
            this.updateElementStretchX(parseInt(e.target.value));
        });

        document.getElementById('element-stretch-y').addEventListener('input', (e) => {
            this.updateElementStretchY(parseInt(e.target.value));
        });

        document.getElementById('element-weight-slider').addEventListener('input', (e) => {
            this.updateElementWeight(parseInt(e.target.value));
        });

        document.getElementById('btn-delete-element').addEventListener('click', () => {
            if (this.selectedElement) {
                this.deleteElement(this.selectedElement);
            }
        });

        document.getElementById('btn-copy-element').addEventListener('click', () => {
            if (this.selectedElement) {
                this.copyElement(this.selectedElement);
            }
        });



        document.getElementById('btn-confirm-element-crop').addEventListener('click', () => {
            this.confirmElementCrop();
        });

        // 下载
        document.getElementById('btn-download').addEventListener('click', () => {
            this.downloadImage();
        });

        document.getElementById('btn-change-image').addEventListener('click', () => {
            this.changeImage();
        });

        // 画中画
        document.getElementById('btn-pip').addEventListener('click', () => {
            this.showPipModal();
        });
        document.getElementById('pip-upload-box').addEventListener('click', () => {
            document.getElementById('pip-image-upload').click();
        });
        document.getElementById('pip-image-upload').addEventListener('change', (e) => {
            this.handlePipImageUpload(e);
        });
        document.getElementById('btn-pip-crop').addEventListener('click', () => {
            this.startPipCrop();
        });
        document.getElementById('btn-confirm-pip').addEventListener('click', () => {
            this.confirmPip();
        });

        // 模态框
        document.querySelectorAll('.btn-cancel').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.add('hidden');
            });
        });

        document.getElementById('btn-confirm-text').addEventListener('click', () => {
            this.addTextElement();
        });

        // 文本预览实时更新
        document.getElementById('text-input').addEventListener('input', () => {
            this.updateTextPreview();
        });
        document.getElementById('text-font-select').addEventListener('change', () => {
            this.updateTextPreview();
        });
        document.getElementById('text-color').addEventListener('input', () => {
            this.updateTextPreview();
        });

        // Emoji 预览更新
        document.getElementById('kaomoji-input').addEventListener('input', () => {
            this.updateEmojiPreview();
        });
        document.getElementById('kaomoji-text-color').addEventListener('input', () => {
            this.updateEmojiPreview();
        });

        // 键盘事件
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' && this.selectedElement) {
                this.deleteElement(this.selectedElement);
            }
        });

        // 手动添加
        document.getElementById('btn-manual-add').addEventListener('click', () => {
            this.manualAdd();
        });

        document.getElementById('manual-kaomoji-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.manualAdd();
            }
        });

        document.getElementById('btn-batch-add').addEventListener('click', () => {
            this.batchAdd();
        });
    }

    // 渲染颜文字网格
    renderKaomojiGrid(searchQuery = '') {
        const grid = document.getElementById('kaomoji-grid');
        grid.innerHTML = '';

        let kaomojis = [];
        if (this.currentCategory === 'favorites') {
            kaomojis = this.favorites.map(text => ({ text, category: 'favorites', categoryName: '我的收藏' }));
        } else {
            kaomojis = getKaomojiByCategory(this.currentCategory);
        }

            // 获取系统原有颜文字（不含用户添加的）
const systemOriginalItems = this.getSystemItems(this.currentCategory);

// 判断是否可删除：
// 1. 自定义分类（custom_ 开头）：全部可删除
// 2. 系统分类（非 custom_、非 favorites）：只有用户添加的（不在系统原始列表中）才可删除
// 3. 收藏夹：不显示删除按钮
let canDelete = false;

if (this.currentCategory.startsWith('custom_')) {
    canDelete = true;  // 自定义分类全部可删除
} else if (this.currentCategory !== 'favorites') {
    // 系统分类：只有用户添加的才能删除
    canDelete = !systemOriginalItems.includes(k.text);
}
// 收藏夹不显示删除按钮（通过取消收藏来移除）

// 构建按钮
let buttonsHtml = `<button class="action-btn favorite-btn ${this.isFavorited(k.text) ? 'favorited' : ''}" title="收藏">⭐</button>`;
if (canDelete) {
    buttonsHtml += `<button class="action-btn delete-kaomoji-btn" title="删除">🗑️</button>`;
}

const singleBtnClass = !canDelete ? 'single-btn' : '';

card.innerHTML = `
    <div class="kaomoji-text" style="color: ${this.kaomojiColor}">${this.escapeHtml(k.text)}</div>
    <div class="kaomoji-actions ${singleBtnClass}">
        ${buttonsHtml}
    </div>
`; 

            card.querySelector('.favorite-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFavorite(k.text);
            });

            if (canDelete) {
                card.querySelector('.delete-kaomoji-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteKaomoji(k.text);
                });
            }

            card.addEventListener('click', () => {
                this.copyToClipboard(k.text);
            });

            grid.appendChild(card);
        });
    }

    initKaomojiSelector() {
        const input = document.getElementById('kaomoji-input');
        const preview = document.getElementById('emoji-preview');
        const confirmBtn = document.getElementById('btn-confirm-kaomoji');

        input.addEventListener('input', () => {
            preview.textContent = input.value;
        });

        confirmBtn.addEventListener('click', () => {
            const text = input.value.trim();
            if (text) {
                this.addKaomojiElement(text);
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const text = input.value.trim();
                if (text) {
                    this.addKaomojiElement(text);
                }
            }
        });
    }

    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('已复制到剪贴板！');
        } catch (err) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.showToast('已复制到剪贴板！');
        }
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 2000);
    }

    isFavorited(text) {
        return this.favorites.includes(text);
    }

    toggleFavorite(text) {
        if (this.isFavorited(text)) {
            this.favorites = this.favorites.filter(f => f !== text);
            this.showToast('已取消收藏');
        } else {
            this.favorites.push(text);
            this.showToast('已添加到收藏！');
        }
        localStorage.setItem('kaomoji-favorites', JSON.stringify(this.favorites));
        this.renderKaomojiGrid();
    }

    getSystemItems(category) {
    // 每次重新计算，不使用缓存
    const imported = JSON.parse(localStorage.getItem('kaomoji-imported-data') || '{}');
    const importedItems = imported[category] || [];
    const allItems = kaomojiData[category] ? [...kaomojiData[category].items] : [];
    // 系统原有颜文字 = 所有颜文字 - 用户导入的颜文字
    return allItems.filter(item => !importedItems.includes(item));
    }

    deleteKaomoji(text) {
        if (this.currentCategory === 'favorites') {
            this.favorites = this.favorites.filter(f => f !== text);
            localStorage.setItem('kaomoji-favorites', JSON.stringify(this.favorites));
            this.showToast('已从收藏中删除');
        } else if (this.currentCategory.startsWith('custom_') && kaomojiData[this.currentCategory]) {
            kaomojiData[this.currentCategory].items = kaomojiData[this.currentCategory].items.filter(item => item !== text);
            this.saveCustomCategories();
            this.showToast('已删除');
        } else if (kaomojiData[this.currentCategory]) {
            // 用户添加到系统标签的颜文字
            kaomojiData[this.currentCategory].items = kaomojiData[this.currentCategory].items.filter(item => item !== text);
            saveImportedKaomoji(this.currentCategory);
            this.showToast('已删除');
        }
        this.renderKaomojiGrid();
    }

    // ========== 图片编辑器功能 ==========

    handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            this.image = new Image();
            this.image.onload = () => {
                // 清除所有文本和emoji元素
                this.elements = [];
                this.selectElement(null);
                this.initCanvas();
            };
            this.image.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    initCanvas() {
        const container = document.getElementById('canvas-container');

        // 只移除占位框，保留浮动控件
        const placeholder = document.getElementById('upload-placeholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }

        // 移除旧的 canvas
        const oldCanvas = document.getElementById('editor-canvas');
        if (oldCanvas) oldCanvas.remove();

        this.canvas = document.createElement('canvas');
        this.canvas.id = 'editor-canvas';
        this.ctx = this.canvas.getContext('2d');

        this.canvas.width = this.image.width;
        this.canvas.height = this.image.height;

        container.insertBefore(this.canvas, container.firstChild);

        this.drawCanvas();
        this.bindCanvasEvents();
    }

    drawCanvas() {
        if (!this.ctx || !this.image) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();

        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.rotate(this.rotation * Math.PI / 180);
        this.ctx.scale(this.scale, this.scale);
        this.ctx.drawImage(
            this.image,
            -this.image.width / 2,
            -this.image.height / 2
        );

        this.ctx.restore();

        this.elements.forEach(el => {
            this.drawElement(el);
        });
    }

    rotateImage(deg) {
        this.rotation += deg;
        this.drawCanvas();
    }

    toggleCropMode() {
        this.isCropMode = !this.isCropMode;
        const btn = document.getElementById('btn-crop');
        const toolbar = document.getElementById('crop-toolbar');

        if (this.isCropMode) {
            btn.classList.add('active');
            btn.title = '裁剪中...';
            toolbar.style.display = 'flex';
            this.showCropOverlay();
        } else {
            btn.classList.remove('active');
            btn.title = '裁剪';
            toolbar.style.display = 'none';
            this.hideCropOverlay();
        }
    }

    cancelCrop() {
        this.isCropMode = false;
        const btn = document.getElementById('btn-crop');
        const toolbar = document.getElementById('crop-toolbar');
        btn.classList.remove('active');
        btn.title = '裁剪';
        toolbar.style.display = 'none';
        this.hideCropOverlay();
    }

    confirmCrop() {
        this.applyCrop();
        this.isCropMode = false;
        const btn = document.getElementById('btn-crop');
        const toolbar = document.getElementById('crop-toolbar');
        btn.classList.remove('active');
        btn.title = '裁剪';
        toolbar.style.display = 'none';
    }

    hideCropOverlay() {
        if (this.cropArea) {
            this.cropArea.remove();
            this.cropArea = null;
        }
    }

    showCropOverlay() {
        const container = document.getElementById('canvas-container');
        const oldOverlay = container.querySelector('.crop-overlay');
        if (oldOverlay) oldOverlay.remove();

        const overlay = document.createElement('div');
        overlay.className = 'crop-overlay';
        overlay.style.width = '80%';
        overlay.style.height = '80%';
        overlay.style.left = '10%';
        overlay.style.top = '10%';

        // 添加四角控制点
        const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
        corners.forEach(pos => {
            const corner = document.createElement('div');
            corner.className = `crop-corner ${pos}`;
            corner.dataset.corner = pos;
            overlay.appendChild(corner);
        });

        this.applyCropRatioToOverlay(overlay);
        this.setupCropInteractions(overlay, container);

        container.appendChild(overlay);
        this.cropArea = overlay;
    }

    setupCropInteractions(overlay, container) {
        let isDragging = false;
        let isResizing = false;
        let resizeCorner = null;
        let startX, startY;
        let startRect = {};

        const getPos = (e) => {
            const rect = container.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        };

        const onStart = (e) => {
            if (e.target.classList.contains('crop-corner')) {
                isResizing = true;
                resizeCorner = e.target.dataset.corner;
            } else if (e.target === overlay) {
                isDragging = true;
            }
            const pos = getPos(e);
            startX = pos.x;
            startY = pos.y;
            startRect = {
                left: parseFloat(overlay.style.left) / 100 * container.offsetWidth,
                top: parseFloat(overlay.style.top) / 100 * container.offsetHeight,
                width: parseFloat(overlay.style.width) / 100 * container.offsetWidth,
                height: parseFloat(overlay.style.height) / 100 * container.offsetHeight
            };
            e.preventDefault();
        };

        const onMove = (e) => {
            if (!isDragging && !isResizing) return;
            const pos = getPos(e);
            const dx = pos.x - startX;
            const dy = pos.y - startY;

            if (isDragging) {
                let newLeft = startRect.left + dx;
                let newTop = startRect.top + dy;
                newLeft = Math.max(0, Math.min(container.offsetWidth - startRect.width, newLeft));
                newTop = Math.max(0, Math.min(container.offsetHeight - startRect.height, newTop));
                overlay.style.left = (newLeft / container.offsetWidth * 100) + '%';
                overlay.style.top = (newTop / container.offsetHeight * 100) + '%';
            } else if (isResizing) {
                this.resizeCropOverlay(overlay, container, resizeCorner, startRect, dx, dy);
            }
        };

        const onEnd = () => {
            isDragging = false;
            isResizing = false;
            resizeCorner = null;
        };

        overlay.addEventListener('mousedown', onStart);
        overlay.addEventListener('touchstart', onStart, { passive: false });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchend', onEnd);
    }

    resizeCropOverlay(overlay, container, corner, startRect, dx, dy) {
        let newLeft = startRect.left;
        let newTop = startRect.top;
        let newWidth = startRect.width;
        let newHeight = startRect.height;

        const ratio = this.getCropRatio();
        const minSize = 50;

        if (corner === 'bottom-right') {
            newWidth = Math.max(minSize, startRect.width + dx);
            newHeight = ratio ? newWidth / ratio : Math.max(minSize, startRect.height + dy);
        } else if (corner === 'bottom-left') {
            newWidth = Math.max(minSize, startRect.width - dx);
            newHeight = ratio ? newWidth / ratio : Math.max(minSize, startRect.height + dy);
            newLeft = startRect.left + startRect.width - newWidth;
        } else if (corner === 'top-right') {
            newWidth = Math.max(minSize, startRect.width + dx);
            newHeight = ratio ? newWidth / ratio : Math.max(minSize, startRect.height - dy);
            newTop = startRect.top + startRect.height - newHeight;
        } else if (corner === 'top-left') {
            newWidth = Math.max(minSize, startRect.width - dx);
            newHeight = ratio ? newWidth / ratio : Math.max(minSize, startRect.height - dy);
            newLeft = startRect.left + startRect.width - newWidth;
            newTop = startRect.top + startRect.height - newHeight;
        }

        // 边界检查
        newLeft = Math.max(0, Math.min(container.offsetWidth - newWidth, newLeft));
        newTop = Math.max(0, Math.min(container.offsetHeight - newHeight, newTop));
        newWidth = Math.min(newWidth, container.offsetWidth - newLeft);
        newHeight = Math.min(newHeight, container.offsetHeight - newTop);

        overlay.style.left = (newLeft / container.offsetWidth * 100) + '%';
        overlay.style.top = (newTop / container.offsetHeight * 100) + '%';
        overlay.style.width = (newWidth / container.offsetWidth * 100) + '%';
        overlay.style.height = (newHeight / container.offsetHeight * 100) + '%';
    }

    getCropRatio() {
        if (this.cropRatio === 'free' || !this.cropRatio) return null;
        const parts = this.cropRatio.split(':');
        if (parts.length < 2) return null;
        const w = parseFloat(parts[0]);
        const h = parseFloat(parts[1].replace(/[hv]/, ''));
        if (parts[1].includes('v')) return h / w; // 竖版
        return w / h; // 横版或1:1
    }

    applyCropRatioToOverlay(overlay) {
        const ratio = this.getCropRatio();
        if (!ratio) return;

        const container = document.getElementById('canvas-container');
        const maxW = container.offsetWidth * 0.8;
        const maxH = container.offsetHeight * 0.8;

        let w = maxW, h = w / ratio;
        if (h > maxH) {
            h = maxH;
            w = h * ratio;
        }

        overlay.style.width = (w / container.offsetWidth * 100) + '%';
        overlay.style.height = (h / container.offsetHeight * 100) + '%';
        overlay.style.left = ((container.offsetWidth - w) / 2 / container.offsetWidth * 100) + '%';
        overlay.style.top = ((container.offsetHeight - h) / 2 / container.offsetHeight * 100) + '%';
    }

    updateCropRatio() {
        if (this.cropArea) {
            this.applyCropRatioToOverlay(this.cropArea);
        }
    }

    applyCrop() {
        if (!this.cropArea) return;

        const container = document.getElementById('canvas-container');
        const canvasEl = document.getElementById('editor-canvas');
        const containerRect = container.getBoundingClientRect();
        const canvasRect = canvasEl.getBoundingClientRect();

        // 计算 canvas 的 CSS 缩放比例
        const cssScaleX = canvasRect.width / this.canvas.width;
        const cssScaleY = canvasRect.height / this.canvas.height;

        // 计算图片在 canvas 上的偏移（居中）
        const imgOffsetX = (this.canvas.width - this.image.width * this.scale) / 2;
        const imgOffsetY = (this.canvas.height - this.image.height * this.scale) / 2;

        // 将裁剪区域从百分比转为容器像素，再转为 canvas 内部像素
        const cropXPx = (parseFloat(this.cropArea.style.left) / 100) * containerRect.width;
        const cropYPx = (parseFloat(this.cropArea.style.top) / 100) * containerRect.height;
        const cropWPx = (parseFloat(this.cropArea.style.width) / 100) * containerRect.width;
        const cropHPx = (parseFloat(this.cropArea.style.height) / 100) * containerRect.height;

        // canvas 内部坐标（需要考虑 CSS 缩放）
        const cropXCanvas = (cropXPx - canvasRect.left + containerRect.left) / cssScaleX;
        const cropYCanvas = (cropYPx - canvasRect.top + containerRect.top) / cssScaleY;
        const cropWCanvas = cropWPx / cssScaleX;
        const cropHCanvas = cropHPx / cssScaleY;

        // 转换为原始图片坐标（考虑图片居中和 scale）
        let srcX = (cropXCanvas - imgOffsetX) / this.scale;
        let srcY = (cropYCanvas - imgOffsetY) / this.scale;
        let srcW = cropWCanvas / this.scale;
        let srcH = cropHCanvas / this.scale;

        // 边界检查
        srcX = Math.max(0, srcX);
        srcY = Math.max(0, srcY);
        srcW = Math.min(this.image.width - srcX, srcW);
        srcH = Math.min(this.image.height - srcY, srcH);

        // 确保宽高有效
        if (srcW <= 0 || srcH <= 0) {
            this.showToast('裁剪区域无效');
            return;
        }

        // 从原始图片裁剪
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = srcW;
        tempCanvas.height = srcH;
        const tempCtx = tempCanvas.getContext('2d');

        tempCtx.drawImage(
            this.image,
            srcX, srcY, srcW, srcH,
            0, 0, srcW, srcH
        );

        this.image = new Image();
        this.image.onload = () => {
            this.canvas.width = this.image.width;
            this.canvas.height = this.image.height;
            this.scale = 1;
            this.rotation = 0;
            this.drawCanvas();
        };
        this.image.src = tempCanvas.toDataURL();

        this.cropArea.remove();
        this.cropArea = null;
        this.showToast('裁剪完成！');
    }

    bindCanvasEvents() {
        let isDragging = false;
        let dragElement = null;
        let dragStartX, dragStartY;

        const getCanvasCoords = (clientX, clientY) => {
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: (clientX - rect.left) * (this.canvas.width / rect.width),
                y: (clientY - rect.top) * (this.canvas.height / rect.height)
            };
        };

        const handleStart = (x, y) => {
            for (let i = this.elements.length - 1; i >= 0; i--) {
                const el = this.elements[i];
                if (this.isPointInElement(x, y, el)) {
                    this.selectElement(el);
                    isDragging = true;
                    dragElement = el;
                    dragStartX = x - el.x;
                    dragStartY = y - el.y;
                    this.drawCanvas();
                    return;
                }
            }
            this.selectElement(null);
            this.drawCanvas();
        };

        const handleMove = (x, y) => {
            if (!isDragging || !dragElement) return;
            dragElement.x = x - dragStartX;
            dragElement.y = y - dragStartY;
            this.drawCanvas();
        };

        const handleEnd = () => {
            isDragging = false;
            dragElement = null;
        };

        // 鼠标事件
        this.canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const { x, y } = getCanvasCoords(e.clientX, e.clientY);
            handleStart(x, y);
        });
        this.canvas.addEventListener('mousemove', (e) => {
            const { x, y } = getCanvasCoords(e.clientX, e.clientY);
            handleMove(x, y);
        });
        this.canvas.addEventListener('mouseup', handleEnd);

        // 触摸事件
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const { x, y } = getCanvasCoords(touch.clientX, touch.clientY);
            handleStart(x, y);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const { x, y } = getCanvasCoords(touch.clientX, touch.clientY);
            handleMove(x, y);
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            handleEnd();
        });
    }

    selectElement(el) {
        this.selectedElement = el;
        const editGroup = document.getElementById('element-edit-group');
        const weightControl = document.getElementById('weight-control');

        if (el) {
            editGroup.style.display = 'flex';
            document.getElementById('element-scale').value = (el.scale || 1) * 100;
            document.getElementById('scale-value').textContent = Math.round((el.scale || 1) * 100) + '%';
            document.getElementById('element-rotate').value = el.rotation || 0;
            document.getElementById('rotate-value').textContent = (el.rotation || 0) + '°';
            document.getElementById('element-stretch-x').value = (el.stretchX || 1) * 100;
            document.getElementById('stretch-x-value').textContent = Math.round((el.stretchX || 1) * 100) + '%';
            document.getElementById('element-stretch-y').value = (el.stretchY || 1) * 100;
            document.getElementById('stretch-y-value').textContent = Math.round((el.stretchY || 1) * 100) + '%';

            // 粗细控件仅对文本和emoji显示
            if (el.type === 'text' || el.type === 'kaomoji') {
                weightControl.style.display = 'flex';
                const weight = el.fontWeight || '400';
                document.getElementById('element-weight-slider').value = weight;
                document.getElementById('element-weight-value').textContent = weight;
            } else {
                weightControl.style.display = 'none';
            }

            // 进度条颜色跟随元素颜色
            this.updateSliderColor(el.color || '#333333');
        } else {
            editGroup.style.display = 'none';
        }
    }

    updateSliderColor(color) {
        const sliders = document.querySelectorAll('.float-control input[type="range"]');
        sliders.forEach(slider => {
            const percent = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
            slider.style.background = `linear-gradient(to right, ${color} ${percent}%, var(--border) ${percent}%)`;
            slider.style.setProperty('--thumb-color', color);
        });
    }

    updateElementScale(scalePercent) {
        if (!this.selectedElement) return;
        const scale = scalePercent / 100;
        this.selectedElement.scale = scale;
        document.getElementById('scale-value').textContent = scalePercent + '%';
        this.updateSliderColor(this.selectedElement.color || '#333333');
        this.drawCanvas();
    }

    updateElementRotate(deg) {
        if (!this.selectedElement) return;
        this.selectedElement.rotation = deg;
        document.getElementById('rotate-value').textContent = deg + '°';
        this.updateSliderColor(this.selectedElement.color || '#333333');
        this.drawCanvas();
    }

    updateElementStretchX(percent) {
        if (!this.selectedElement) return;
        this.selectedElement.stretchX = percent / 100;
        document.getElementById('stretch-x-value').textContent = percent + '%';
        this.updateSliderColor(this.selectedElement.color || '#333333');
        this.drawCanvas();
    }

    updateElementStretchY(percent) {
        if (!this.selectedElement) return;
        this.selectedElement.stretchY = percent / 100;
        document.getElementById('stretch-y-value').textContent = percent + '%';
        this.updateSliderColor(this.selectedElement.color || '#333333');
        this.drawCanvas();
    }

    updateElementWeight(value) {
        if (!this.selectedElement) return;
        this.selectedElement.fontWeight = value;
        document.getElementById('element-weight-value').textContent = value;
        this.updateSliderColor(this.selectedElement.color || '#333333');
        this.drawCanvas();
    }

    isPointInElement(x, y, el) {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(el.x, el.y);
        ctx.rotate((el.rotation || 0) * Math.PI / 180);
        const sx = (el.scale || 1) * (el.stretchX || 1);
        const sy = (el.scale || 1) * (el.stretchY || 1);
        ctx.scale(sx, sy);

        let width, height;
        if (el.type === 'text' || el.type === 'kaomoji') {
            const isPixelFont = el.fontFamily && el.fontFamily.includes('Bitmap');
            const baseFontSize = isPixelFont ? 9 : el.fontSize;
            const pixelScale = isPixelFont ? (el.fontSize / 9) : 1;
            const fontWeight = el.fontWeight || 'normal';
            ctx.font = `${fontWeight} ${baseFontSize}px ${el.fontFamily || '"Segoe UI", "PingFang SC", sans-serif'}`;
            const metrics = ctx.measureText(el.text || el.content);
            width = isPixelFont ? (metrics.width * pixelScale) : metrics.width;
            height = isPixelFont ? (9 * pixelScale) : el.fontSize;
        } else if (el.type === 'image') {
            width = el.width;
            height = el.height;
        }

        ctx.restore();

        const dx = x - el.x;
        const dy = y - el.y;
        const cos = Math.cos(-(el.rotation || 0) * Math.PI / 180);
        const sin = Math.sin(-(el.rotation || 0) * Math.PI / 180);
        const localX = dx * cos - dy * sin;
        const localY = dx * sin + dy * cos;

         // 动态触摸缓冲区：小元素给更多缓冲，大元素给较少缓冲
        // 最小 8px，最大 20px，根据元素大小动态调整
        const elementSize = Math.max(width * sx, height * sy);
        const touchPadding = Math.min(20, Math.max(8, 80 / elementSize * 10)) / Math.max(sx, sy);
        return localX >= -width * sx / 2 - touchPadding && localX <= width * sx / 2 + touchPadding &&
               localY >= -height * sy / 2 - touchPadding && localY <= height * sy / 2 + touchPadding;
    }

    drawElement(el) {
        this.ctx.save();
        this.ctx.translate(el.x, el.y);
        this.ctx.rotate((el.rotation || 0) * Math.PI / 180);
        const sx = (el.scale || 1) * (el.stretchX || 1);
        const sy = (el.scale || 1) * (el.stretchY || 1);
        this.ctx.scale(sx, sy);

        if (el.type === 'text' || el.type === 'kaomoji') {
            // 像素字体使用原生大小，通过scale缩放
            const isPixelFont = el.fontFamily && el.fontFamily.includes('Bitmap');
            const baseFontSize = isPixelFont ? 9 : el.fontSize;
            const pixelScale = isPixelFont ? (el.fontSize / 9) : 1;
            const fontWeight = el.fontWeight || 'normal';

            this.ctx.font = `${fontWeight} ${baseFontSize}px ${el.fontFamily || '"Segoe UI", "PingFang SC", sans-serif'}`;
            this.ctx.fillStyle = el.color;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.save();
            this.ctx.scale(pixelScale, pixelScale);
            this.ctx.fillText(el.text || el.content, 0, 0);
            this.ctx.restore();

            if (this.selectedElement === el) {
                const metrics = this.ctx.measureText(el.text || el.content);
                this.ctx.strokeStyle = '#ff6b9d';
                this.ctx.lineWidth = 2 / Math.max(sx, sy);
                const boxWidth = isPixelFont ? (metrics.width * pixelScale) : metrics.width;
                const boxHeight = isPixelFont ? (9 * pixelScale) : el.fontSize;
                this.ctx.strokeRect(
                    -boxWidth / 2 - 5,
                    -boxHeight / 2 - 5,
                    boxWidth + 10,
                    boxHeight + 10
                );
            }
        } else if (el.type === 'image' && el.image) {
            this.ctx.drawImage(el.image, -el.width / 2, -el.height / 2, el.width, el.height);

            if (this.selectedElement === el) {
                this.ctx.strokeStyle = '#ff6b9d';
                this.ctx.lineWidth = 2 / Math.max(sx, sy);
                this.ctx.strokeRect(-el.width / 2, -el.height / 2, el.width, el.height);
            }
        }

        this.ctx.restore();
    }

    showTextModal() {
        if (!this.canvas) {
            this.showToast('请先上传图片！');
            return;
        }
        document.getElementById('text-modal').classList.remove('hidden');
        document.getElementById('text-input').value = '';
        this.updateTextPreview();
        document.getElementById('text-input').focus();
    }

    updateTextPreview() {
        const text = document.getElementById('text-input').value || '预览文字';
        const color = document.getElementById('text-color').value;
        const fontSelect = document.getElementById('text-font-select');
        const fontFamily = fontSelect.value;
        const preview = document.getElementById('text-preview-content');

        preview.textContent = text;
        preview.style.color = color;
        preview.style.fontWeight = '400';

        if (fontFamily === 'default') {
            preview.style.fontFamily = '"Segoe UI", "PingFang SC", sans-serif';
        } else {
            preview.style.fontFamily = `"${fontFamily}", sans-serif`;
        }
    }

    addTextElement() {
        const text = document.getElementById('text-input').value;
        const color = document.getElementById('text-color').value;
        const fontSelect = document.getElementById('text-font-select');
        const fontFamily = fontSelect.value;

        if (!text) {
            this.showToast('请输入文字！');
            return;
        }

        const fontFamilyCSS = fontFamily === 'default'
            ? '"Segoe UI", "PingFang SC", sans-serif'
            : `"${fontFamily}", sans-serif`;

                // 根据 canvas 尺寸计算合适的初始字体大小
        const baseFontSize = Math.max(48, Math.min(this.canvas.width, this.canvas.height) * 0.08);
        
        this.elements.push({
            type: 'text',
            text: text,
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            fontSize: baseFontSize,
            color: color,
            fontFamily: fontFamilyCSS,
            fontWeight: '400',
            scale: 1,
            rotation: 0
        });

        document.getElementById('text-input').value = '';
        document.getElementById('text-modal').classList.add('hidden');
        this.drawCanvas();
        this.showToast('文字已添加，拖动调整位置，使用右侧滑块缩放旋转');
    }

    showKaomojiModal() {
        if (!this.canvas) {
            this.showToast('请先上传图片！');
            return;
        }
        document.getElementById('kaomoji-modal').classList.remove('hidden');
        document.getElementById('kaomoji-input').value = '';
        document.getElementById('emoji-preview').textContent = '';
        document.getElementById('kaomoji-input').focus();
        this.updateEmojiPreview();
    }

    updateEmojiPreview() {
        const input = document.getElementById('kaomoji-input');
        const preview = document.getElementById('emoji-preview');
        const color = document.getElementById('kaomoji-text-color').value;

        preview.textContent = input.value || '😊';
        preview.style.color = color;
    }

    addKaomojiElement(text) {
        if (!text) return;
        const color = document.getElementById('kaomoji-text-color').value;

               // 根据 canvas 尺寸计算合适的初始字体大小
        const baseFontSize = Math.max(48, Math.min(this.canvas.width, this.canvas.height) * 0.08);
        
        this.elements.push({
            type: 'kaomoji',
            text: text,
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            fontSize: baseFontSize,
            color: color,
            fontWeight: '400',
            scale: 1,
            rotation: 0
        }); 

        this.drawCanvas();
        document.getElementById('kaomoji-modal').classList.add('hidden');
        this.showToast('Emoji 已添加，拖动调整位置');
    }

    handleOverlayUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const maxSize = Math.min(this.canvas.width, this.canvas.height) * 0.3;
                const scale = Math.min(maxSize / img.width, maxSize / img.height);

                this.elements.push({
                    type: 'image',
                    image: img,
                    x: this.canvas.width / 2,
                    y: this.canvas.height / 2,
                    width: img.width,
                    height: img.height,
                    scale: scale,
                    rotation: 0,
                    originalWidth: img.width,
                    originalHeight: img.height
                });

                this.drawCanvas();
                this.showToast('图片已添加，拖动调整位置，使用右侧滑块缩放旋转，点击裁剪按钮裁剪');
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }

    startElementCrop() {
        if (!this.selectedElement || this.selectedElement.type !== 'image') return;

        const el = this.selectedElement;
        const container = document.getElementById('element-crop-container');
        container.innerHTML = '';

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = el.originalWidth;
        cropCanvas.height = el.originalHeight;
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.drawImage(el.image, 0, 0);

        container.appendChild(cropCanvas);

        this.elementCropTarget = {
            element: el,
            canvas: cropCanvas,
            ctx: cropCtx
        };

        document.getElementById('element-crop-modal').classList.remove('hidden');
        this.showToast('点击图片并拖动选择裁剪区域');
    }

    confirmElementCrop() {
        if (!this.elementCropTarget) return;

        const { element, canvas } = this.elementCropTarget;

        const newImg = new Image();
        newImg.onload = () => {
            element.image = newImg;
            element.width = canvas.width;
            element.height = canvas.height;
            element.originalWidth = canvas.width;
            element.originalHeight = canvas.height;
            this.drawCanvas();
            this.showToast('图片裁剪完成！');
        };
        newImg.src = canvas.toDataURL();

        this.elementCropTarget = null;
        document.getElementById('element-crop-modal').classList.add('hidden');
    }

    deleteElement(el) {
        this.elements = this.elements.filter(e => e !== el);
        this.selectElement(null);
        this.drawCanvas();
    }

    copyElement(el) {
        const copy = { ...el };
        copy.x = el.x + 30;
        copy.y = el.y + 30;

        if (el.type === 'image' && el.image) {
            const img = new Image();
            img.src = el.image.src;
            copy.image = img;
        }

        this.elements.push(copy);
        this.selectElement(copy);
        this.drawCanvas();
        this.showToast('已复制元素');
    }

        async downloadImage() {
        if (!this.canvas) {
            this.showToast('请先上传图片！');
            return;
        }

        const selected = this.selectedElement;
        this.selectElement(null);
        this.drawCanvas();

        const dataUrl = this.canvas.toDataURL('image/png');
        const filename = `kaomoji-edit-${Date.now()}.png`;

        // 尝试使用 Web Share API（手机端）
        if (navigator.share && navigator.canShare) {
            try {
                // 将 dataURL 转换为 Blob
                const response = await fetch(dataUrl);
                const blob = await response.blob();
                const file = new File([blob], filename, { type: 'image/png' });

        if (navigator.canShare({ files: [file] })) {
                    // this.showToast('请在弹出的菜单中选择保存方式');
                    await navigator.share({
                        files: [file],
                        title: '保存图片',
                        text: '选择"保存图片"保存到相册'
                    });
                }else {
                    // 不支持分享文件，回退到下载
                    this.fallbackDownload(dataUrl, filename);
                }
            } catch (err) {
                // 用户取消分享或出错，回退到下载
                if (err.name !== 'AbortError') {
                    this.fallbackDownload(dataUrl, filename);
                }
            }
        } else {
            // 不支持 Web Share API，使用传统下载
            this.fallbackDownload(dataUrl, filename);
        }

        this.selectElement(selected);
        this.drawCanvas();
    }

    fallbackDownload(dataUrl, filename) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
        this.showToast('图片已下载！');
    } 

    changeImage() {
        // 触发文件选择框
        document.getElementById('image-upload').click();
    }

    // ========== 画中画功能 ==========

    showPipModal() {
        if (!this.canvas) {
            this.showToast('请先上传图片！');
            return;
        }
        document.getElementById('pip-modal').classList.remove('hidden');
        // 重置状态
        document.getElementById('pip-upload-area').style.display = 'block';
        document.getElementById('pip-canvas-area').style.display = 'none';
        document.getElementById('pip-tools').style.display = 'none';
        this.pipImage = null;
        this.pipCropData = null;
    }

    handlePipImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                this.pipImage = img;
                this.pipCropData = null;

                // 显示 canvas
                document.getElementById('pip-upload-area').style.display = 'none';
                document.getElementById('pip-canvas-area').style.display = 'flex';
                document.getElementById('pip-tools').style.display = 'flex';

                const canvas = document.getElementById('pip-canvas');
                const ctx = canvas.getContext('2d');

                // 限制预览大小
                const maxW = 400, maxH = 300;
                let w = img.width, h = img.height;
                if (w > maxW) { h = h * maxW / w; w = maxW; }
                if (h > maxH) { w = w * maxH / h; h = maxH; }

                canvas.width = img.width;
                canvas.height = img.height;
                canvas.style.width = w + 'px';
                canvas.style.height = h + 'px';
                ctx.drawImage(img, 0, 0);

                // 显示裁剪工具
                document.getElementById('pip-tools').style.display = 'flex';
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

        startPipCrop() {
        if (!this.pipImage) return;
        this.showToast('请在画布上拖拽选择裁剪区域');
        const canvas = document.getElementById('pip-canvas');
        const ctx = canvas.getContext('2d');

        // 重绘图片
        ctx.drawImage(this.pipImage, 0, 0);

        let startX, startY, isDrawing = false;

        const getPos = (clientX, clientY) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return {
                x: (clientX - rect.left) * scaleX,
                y: (clientY - rect.top) * scaleY
            };
        };

        const drawCrop = (pos) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(this.pipImage, 0, 0);
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.clearRect(startX, startY, pos.x - startX, pos.y - startY);
            ctx.drawImage(this.pipImage, startX, startY, pos.x - startX, pos.y - startY, startX, startY, pos.x - startX, pos.y - startY);
            ctx.strokeStyle = '#ff6b9d';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(startX, startY, pos.x - startX, pos.y - startY);
            ctx.setLineDash([]);
        };

        const finishCrop = (pos) => {
            if (!isDrawing) return;
            isDrawing = false;
            const x = Math.min(startX, pos.x);
            const y = Math.min(startY, pos.y);
            const w = Math.abs(pos.x - startX);
            const h = Math.abs(pos.y - startY);

            if (w > 10 && h > 10) {
                this.pipCropData = { x, y, w, h };
                this.showToast('裁剪区域已选择，点击确定添加');
            }

            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('touchstart', onTouchStart, { passive: false });
            canvas.removeEventListener('touchmove', onTouchMove, { passive: false });
            canvas.removeEventListener('touchend', onTouchEnd);
        };

        // 鼠标事件（桌面端）
        const onMouseDown = (e) => {
            const pos = getPos(e.clientX, e.clientY);
            startX = pos.x;
            startY = pos.y;
            isDrawing = true;
        };

        const onMouseMove = (e) => {
            if (!isDrawing) return;
            drawCrop(getPos(e.clientX, e.clientY));
        };

        const onMouseUp = (e) => {
            finishCrop(getPos(e.clientX, e.clientY));
        };

        // 触摸事件（手机端）
        const onTouchStart = (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const pos = getPos(touch.clientX, touch.clientY);
            startX = pos.x;
            startY = pos.y;
            isDrawing = true;
        };

        const onTouchMove = (e) => {
            e.preventDefault();
            if (!isDrawing) return;
            const touch = e.touches[0];
            drawCrop(getPos(touch.clientX, touch.clientY));
        };

        const onTouchEnd = (e) => {
            if (!isDrawing) return;
            const touch = e.changedTouches[0];
            finishCrop(getPos(touch.clientX, touch.clientY));
        };

        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd);
    }

    confirmPip() {
        if (!this.pipImage) {
            this.showToast('请先添加图片！');
            return;
        }

        let img = this.pipImage;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;

        if (this.pipCropData) {
            sx = this.pipCropData.x;
            sy = this.pipCropData.y;
            sw = this.pipCropData.w;
            sh = this.pipCropData.h;
        }

        // 创建裁剪后的图片
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = sw;
        tempCanvas.height = sh;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

        const croppedImg = new Image();
        croppedImg.onload = () => {
            // 缩放到合适大小
            const maxDim = Math.min(this.canvas.width, this.canvas.height) * 0.4;
            let w = croppedImg.width, h = croppedImg.height;
            if (w > maxDim || h > maxDim) {
                const ratio = maxDim / Math.max(w, h);
                w *= ratio;
                h *= ratio;
            }

            this.elements.push({
                type: 'image',
                image: croppedImg,
                x: this.canvas.width / 2,
                y: this.canvas.height / 2,
                width: w,
                height: h,
                scale: 1,
                rotation: 0
            });

            this.drawCanvas();
            document.getElementById('pip-modal').classList.add('hidden');
            this.showToast('画中画已添加！');
        };
        croppedImg.src = tempCanvas.toDataURL();
    }

    // ========== 手动添加功能 ==========

        manualAdd() {
        const input = document.getElementById('manual-kaomoji-input');
        const category = document.getElementById('manual-category-select').value;
        const text = input.value.trim();

        if (!text) {
            this.showToast('请输入颜文字！');
            return;
        }

        if (category === 'favorites') {
            if (!this.favorites.includes(text)) {
                this.favorites.push(text);
                localStorage.setItem('kaomoji-favorites', JSON.stringify(this.favorites));
                this.showToast('已添加到「我的收藏」！');
                input.value = '';
                this.renderKaomojiGrid();
            } else {
                this.showToast('该颜文字已存在！');
            }
            return;
        }

        if (addCustomKaomoji(text, category)) {
            this.showToast(`已添加到「${kaomojiData[category].name}」分类！`);
            input.value = '';
            this.renderKaomojiGrid();
        } else {
            this.showToast('该颜文字已存在！');
        }
    }    

    batchAdd() {
        const textarea = document.getElementById('manual-batch-input');
        const category = document.getElementById('manual-category-select').value;
        const content = textarea.value.trim();

        if (!content) {
            this.showToast('请输入颜文字！');
            return;
        }

        const lines = content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (lines.length === 0) {
            this.showToast('请输入颜文字！');
            return;
        }

        const added = importKaomojiList(lines, category);
        if (added > 0) {
            this.showToast(`成功添加 ${added} 个颜文字到「${kaomojiData[category].name}」！`);
            textarea.value = '';
            this.renderKaomojiGrid();
        } else {
            this.showToast('所有颜文字都已存在！');
        }
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new KaomojiApp();
});
