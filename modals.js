import { state, MAX_SLOTS, saveGame, resetGame } from './state.js';
import { eventData, hideoutData, scaleFunds } from './stage.js';
import { showAlert, updateAlienPower, render } from './ui.js';

// 幹部モーダルDOM
const btnExecutives = document.getElementById('btn-executives');
const executivesModal = document.getElementById('executives-modal');
const executivesListEl = document.getElementById('executives-list');
const btnCloseExecutives = document.getElementById('btn-close-executives');

// アジトモーダルDOM
const btnHideout = document.getElementById('btn-hideout');
const hideoutModal = document.getElementById('hideout-modal');
const btnCloseHideout = document.getElementById('btn-close-hideout');
const btnExpandHideout = document.getElementById('btn-expand-hideout');
const btnReset = document.getElementById('btn-reset');
const hideoutNameEl = document.getElementById('hideout-name');
const hideoutDescEl = document.getElementById('hideout-desc');
const hideoutCollectionsEl = document.getElementById('hideout-collections');

export function initModals() {
    // 幹部モーダル開閉
    btnExecutives.onclick = () => {
        renderExecutives();
        executivesModal.style.display = 'flex';
    };
    btnCloseExecutives.onclick = () => {
        executivesModal.style.display = 'none';
    };

    // アジトモーダル開閉・リセット
    btnHideout.onclick = () => {
        renderHideout();
        hideoutModal.style.display = 'flex';
    };
    btnCloseHideout.onclick = () => {
        hideoutModal.style.display = 'none';
    };
    if (btnReset) btnReset.onclick = resetGame;

    // スロット・拠点拡張
    btnExpandHideout.onclick = async () => {
        if (state.unlockedSlots < MAX_SLOTS) {
            const cost = state.unlockedSlots * 50;
            if (state.cultStats.funds >= cost) {
                state.cultStats.funds -= cost;
                state.unlockedSlots++;
                render();
                renderHideout();
                saveGame();
            }
        } else {
            const nextLevel = state.hideoutLevel + 1;
            if (nextLevel < hideoutData.length) {
                const nextHideout = hideoutData[nextLevel];
                if (state.cultStats.funds >= nextHideout.cost) {
                    state.cultStats.funds -= nextHideout.cost;
                    state.hideoutLevel = nextLevel;
                    render();
                    renderHideout();
                    saveGame();
                    const mult = nextHideout.bonusMultiplier || 1.0;
                    await showAlert('拠点拡張完了！', `アジトが「${nextHideout.name}」にアップグレードされました！\n労働・勧誘の成果が ×${mult.toFixed(1)} になります。`);
                }
            }
        }
    };
}

function renderExecutives() {
    executivesListEl.innerHTML = '';
    
    if (state.executives.length === 0) {
        executivesListEl.innerHTML = '<p style="color:#888; text-align:center;">まだ幹部はいません</p>';
        return;
    }

    state.executives.forEach(exec => {
        const card = document.createElement('div');
        card.className = 'executive-card';
        card.innerHTML = `
            <div class="exec-title">${exec.title}</div>
            <div class="exec-name">${exec.name}</div>
        `;
        
        card.onclick = async () => {
            const msg = `【スキル】${exec.skill.name}\n${exec.skill.description}\n\nスキルを使用しますか？`;
            executivesModal.style.display = 'none'; 
            
            const isConfirmed = await showAlert('幹部スキルの使用', msg, true);
            
            if (isConfirmed) {
                if (exec.skill.effect && exec.skill.effect.notImplemented) {
                    await showAlert('未実装', 'このスキルは今後のアップデート（政治システム）で解放されます。');
                    return;
                }

                // コストは比率制: fundsPercent=所持資金の割合 / mpPercent=最大MPの割合 / followersPercent=信者数の割合
                const fundsPctCost = exec.skill.cost.fundsPercent ? Math.max(1, Math.floor(state.cultStats.funds * exec.skill.cost.fundsPercent)) : 0;
                const mpPctCost = exec.skill.cost.mpPercent ? Math.floor(state.alien.maxMp * exec.skill.cost.mpPercent) : 0;
                if (exec.skill.cost.funds && state.cultStats.funds < scaleFunds(exec.skill.cost.funds)) {
                    await showAlert('発動失敗', '資金が足りません！');
                    return;
                }
                if (exec.skill.cost.fundsPercent && state.cultStats.funds < fundsPctCost) {
                    await showAlert('発動失敗', '資金が足りません！');
                    return;
                }
                if (exec.skill.cost.mp && state.alien.mp < exec.skill.cost.mp) {
                    await showAlert('発動失敗', '精神力(MP)が足りません！');
                    return;
                }
                if (exec.skill.cost.mpPercent && state.alien.mp < mpPctCost) {
                    await showAlert('発動失敗', '精神力(MP)が足りません！');
                    return;
                }
                if (exec.skill.cost.followers && state.cultStats.followers < exec.skill.cost.followers) {
                    await showAlert('発動失敗', '信者が足りません！');
                    return;
                }
                if (exec.skill.cost.followersPercent && state.cultStats.followers < 1) {
                    await showAlert('発動失敗', '信者が足りません！');
                    return;
                }

                if (exec.skill.cost.funds) state.cultStats.funds -= scaleFunds(exec.skill.cost.funds);
                if (fundsPctCost) state.cultStats.funds -= fundsPctCost;
                if (exec.skill.cost.mp) state.alien.mp -= exec.skill.cost.mp;
                if (mpPctCost) state.alien.mp -= mpPctCost;
                if (exec.skill.cost.followers) state.cultStats.followers = Math.max(0, state.cultStats.followers - exec.skill.cost.followers);
                if (exec.skill.cost.followersPercent) {
                    const pctCost = Math.max(1, Math.floor(state.cultStats.followers * exec.skill.cost.followersPercent));
                    state.cultStats.followers = Math.max(0, state.cultStats.followers - pctCost);
                    updateAlienPower();
                }

                if (exec.skill.effect.suspicion) {
                    state.cultStats.suspicion = Math.max(0, state.cultStats.suspicion + exec.skill.effect.suspicion);
                }
                if (exec.skill.effect.suspicionSet !== undefined) {
                    state.cultStats.suspicion = exec.skill.effect.suspicionSet;
                }
                if (exec.skill.effect.followers) {
                    state.cultStats.followers += exec.skill.effect.followers;
                    updateAlienPower();
                }
                if (exec.skill.effect.growthRate) {
                    state.growthBonus = (state.growthBonus || 0) + exec.skill.effect.growthRate;
                }
                if (exec.skill.effect.funds) {
                    state.cultStats.funds += scaleFunds(exec.skill.effect.funds);
                }
                
                render();
                saveGame();
                if (exec.skill.effect.ending) {
                    await showAlert('【地球征服完了】', `${exec.name}がエイリアンに地球人類の支配権を認めました。\nここに地球征服は完了し、エイリアンは地球連合の永久総統となったのです。`);
                } else {
                    await showAlert('発動成功', `${exec.name}がスキル「${exec.skill.name}」を発動しました！`);
                }
            }
        };
        executivesListEl.appendChild(card);
    });
}

function renderHideout() {
    const currentHideout = hideoutData[state.hideoutLevel];
    const mult = currentHideout.bonusMultiplier || 1.0;
    hideoutNameEl.innerText = currentHideout.name;
    hideoutDescEl.innerText = `${currentHideout.desc}\n【拠点ボーナス】労働・勧誘の成果 ×${mult.toFixed(1)}`;

    if (state.unlockedSlots < MAX_SLOTS) {
        const cost = state.unlockedSlots * 50;
        btnExpandHideout.innerText = `スロット拡張 (コスト: ${cost}資金)`;
        btnExpandHideout.disabled = state.cultStats.funds < cost;
        btnExpandHideout.style.background = '#0066cc';
    } else {
        const nextLevel = state.hideoutLevel + 1;
        if (nextLevel < hideoutData.length) {
            const nextHideout = hideoutData[nextLevel];
            const nextMult = nextHideout.bonusMultiplier || 1.0;
            btnExpandHideout.innerText = `拠点拡張: ${nextHideout.name} (成果×${nextMult.toFixed(1)})\n(コスト: ${nextHideout.cost}資金)`;
            btnExpandHideout.disabled = state.cultStats.funds < nextHideout.cost;
            btnExpandHideout.style.background = '#e65100';
        } else {
            btnExpandHideout.innerText = "アジトは最高レベルです";
            btnExpandHideout.disabled = true;
            btnExpandHideout.style.background = '#333';
        }
    }

    // eventData からコレクション一覧を直接描画
    hideoutCollectionsEl.innerHTML = '';
    eventData.forEach(ev => {
        const isOwned = state.collections.includes(ev.id);
        const div = document.createElement('div');
        div.className = 'collection-item';

        const price = scaleFunds(ev.cost);
        const btn = document.createElement('button');
        btn.className = isOwned ? 'btn-buy-col owned' : 'btn-buy-col';
        btn.innerText = isOwned ? '所持済' : `${price}G`;
        btn.disabled = isOwned || state.cultStats.funds < price;

        if (!isOwned) {
            btn.onclick = async () => {
                if (state.cultStats.funds >= price) {
                    state.cultStats.funds -= price;
                    state.collections.push(ev.id);
                    render();
                    renderHideout();
                    saveGame();
                    await showAlert('購入完了', `「${ev.itemName}」を手に入れました！\nイベント「${ev.name}」が発生するようになります。`);
                }
            };
        }

        div.innerHTML = `
            <div class="collection-info">
                <span class="collection-name">${ev.itemName}</span>
                <span class="collection-event">解放イベント: ${ev.name}</span>
            </div>
        `;
        div.appendChild(btn);
        hideoutCollectionsEl.appendChild(div);
    });
}
