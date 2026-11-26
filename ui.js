import { state, MAX_SLOTS, SAVE_KEY, computeGrowthRate, isActionLocked } from './state.js?v=4';

// 大きな数を「1.2億」「345万」のように単位表示する
export function formatNumber(n) {
    n = Math.floor(n);
    if (n >= 100000000) return (Math.round(n / 10000000) / 10).toLocaleString() + '億';
    if (n >= 10000) return (Math.round(n / 1000) / 10).toLocaleString() + '万';
    return n.toLocaleString();
}
import { getCurrentStage } from './stage.js?v=4';

// メイン画面DOM
const humanListEl = document.getElementById('human-list');
const btnBrainwash = document.getElementById('btn-brainwash');
const mpText = document.getElementById('mp-text');
const mpBar = document.getElementById('mp-bar');
const turnDisplay = document.getElementById('current-turn');
const bonusDisplay = document.getElementById('bonus-display');
const statSuspicion = document.getElementById('stat-suspicion');
const stageDisplay = document.getElementById('stage-display');

// カスタムモーダルDOM
const customModal = document.getElementById('custom-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalBtnOk = document.getElementById('modal-btn-ok');
const modalBtnCancel = document.getElementById('modal-btn-cancel');

// カスタムアラート
export function showAlert(title, message, isConfirm = false) {
    return new Promise((resolve) => {
        modalTitle.innerText = title;
        modalMessage.innerText = message;
        customModal.style.display = 'flex';
        
        if (isConfirm) {
            modalBtnCancel.style.display = 'block';
            modalBtnCancel.onclick = () => {
                customModal.style.display = 'none';
                resolve(false);
            };
        } else {
            modalBtnCancel.style.display = 'none';
        }

        modalBtnOk.onclick = () => {
            customModal.style.display = 'none';
            resolve(true);
        };
    });
}

// 信者数に応じた精神力パラメータ更新
export function updateAlienPower() {
    state.alien.maxMp = 100 + Math.floor(Math.sqrt(state.cultStats.followers) * 50);
    state.alien.regenMp = 10 + Math.floor(Math.sqrt(state.cultStats.followers) * 5);
    state.alien.mp = Math.min(state.alien.mp, state.alien.maxMp);
}

// メイン画面の描画処理
export function render() {
    const currentStage = getCurrentStage();
    stageDisplay.innerText = state.gameCleared ? `${currentStage.name}（制覇済み）` : currentStage.name;
    turnDisplay.innerText = state.currentTurn;

    document.getElementById('stat-followers').innerText = formatNumber(state.cultStats.followers);
    document.getElementById('stat-funds').innerText = Math.floor(state.cultStats.funds).toLocaleString();
    document.getElementById('stat-growth').innerText = '+' + (computeGrowthRate() * 100).toFixed(1) + '%';
    statSuspicion.innerText = `${state.cultStats.suspicion}%`;

    if (state.cultStats.suspicion >= 70) statSuspicion.classList.add('danger-text');
    else statSuspicion.classList.remove('danger-text');

    bonusDisplay.innerText = `信者の祈りが精神力を高めている... (最大MP: ${state.alien.maxMp} / 回復力: ${state.alien.regenMp})`;

    mpText.innerText = `${state.alien.mp} / ${state.alien.maxMp} (+${state.alien.regenMp}/T)`;
    mpBar.style.width = `${(state.alien.mp / state.alien.maxMp) * 100}%`;

    let currentTargetWillpower = 0;
    const selectedHuman = state.humans.find(h => h.id === state.selectedHumanId);
    if (selectedHuman) currentTargetWillpower = selectedHuman.willpower;

    humanListEl.innerHTML = '';
    for (let i = 0; i < MAX_SLOTS; i++) {
        const slotDiv = document.createElement('div');
        
        if (i < state.unlockedSlots) {
            if (i < state.humans.length) {
                const human = state.humans[i];
                slotDiv.className = `human-card ${state.selectedHumanId === human.id ? 'selected' : ''}`;
                if (human.isBoss) slotDiv.style.borderColor = '#ff3333';
                
                slotDiv.onclick = () => {
                    state.selectedHumanId = human.id;
                    render();
                };

                const isDanger = human.hp <= human.maxHp * 0.3; 
                const hpColor = isDanger ? '#ff3333' : '#aaa';
                const warningIcon = isDanger ? ' ⚠️' : '';
                const isRecruiter = human.type === 'recruit';
                const actionName = human.action === 'rest' ? '休憩' : human.action === 'recruit' ? '勧誘' : human.action === 'labor' ? '労働' : '隠密';
                const actionClass = human.action === 'rest' ? 'active-rest' : (human.action === 'labor' || human.action === 'recruit') ? 'active-labor' : 'active-stealth';
                const roleStatHtml = isRecruiter
                    ? `<span>勧誘: <span style="color:#4fc3f7">${human.recruit}</span></span>`
                    : human.type === 'elite'
                    ? `<span>労働: <span style="color:#ddd">${human.labor}</span></span> <span>影響力: <span style="color:#ffd54f">成長率+${((human.influence || 0) * 0.05).toFixed(1)}%</span></span>`
                    : `<span>労働: <span style="color:#ddd">${human.labor}</span></span>`;

                slotDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span class="human-name" style="${human.isBoss ? 'color: #ff3333;' : ''}">${human.name}</span>
                        ${isActionLocked(human)
                            ? '<span style="padding: 4px 16px; font-size: 0.9rem; color: #888; border: 1px solid #555; border-radius: 4px;">行動不可</span>'
                            : `<button class="action-btn ${actionClass}" style="padding: 4px 16px; font-size: 0.9rem;" onclick="event.stopPropagation(); window.toggleAction(${human.id})">${actionName}</button>`}
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #aaa;">
                        <span>洗脳: <span style="font-weight: bold; color: #fff;">${human.brainwash}%</span></span>
                        <span>抵抗: <span style="color:#ff9800">${human.willpower}</span></span>
                        ${roleStatHtml}
                        <span>体力: <span style="font-weight: bold; color: ${hpColor};">${human.hp}/${human.maxHp}${warningIcon}</span></span>
                    </div>
                    ${human.isBoss && human.uniqueData?.resistSkill ? `<div style="font-size: 0.8rem; color: #ff8a80; margin-top: 4px;">🛡 抵抗スキル「${human.uniqueData.resistSkill.name}」: ${human.uniqueData.resistSkill.description}</div>` : ''}
                    <div class="popup-text" id="popup-${human.id}"></div>
                `;
            } else {
                slotDiv.className = 'empty-slot';
                slotDiv.innerText = "空きスロット (次のターンで補充)";
            }
        } else {
            slotDiv.className = 'locked-slot';
            slotDiv.innerText = "🔒 スロットを拡張して解放";
        }
        humanListEl.appendChild(slotDiv);
    }

    if (state.selectedHumanId) {
        btnBrainwash.innerText = `洗脳する (MP -${currentTargetWillpower})`;
        btnBrainwash.disabled = state.alien.mp < currentTargetWillpower;
    } else {
        btnBrainwash.innerText = `洗脳する`;
        btnBrainwash.disabled = true;
    }

    if (state.cultStats.suspicion >= 100) {
        document.getElementById('game-over-screen').style.display = 'flex';
        localStorage.removeItem(SAVE_KEY);
    }
}
