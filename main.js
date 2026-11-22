import { state, saveGame, loadGame } from './state.js';
import { loadData, stageData, eventData, hideoutData, generateHuman, trySpawnBoss } from './stage.js';
import { showAlert, updateAlienPower, render } from './ui.js';
import { initModals } from './modals.js';

const btnBrainwash = document.getElementById('btn-brainwash');
const btnEndTurn = document.getElementById('btn-end-turn');

// 初期化
async function initGame() {
    try {
        await loadData();
        initModals();
        if (!loadGame()) {
            state.humans = [ generateHuman() ];
            updateAlienPower();
        } else {
            updateAlienPower();
        }
        render();
    } catch (error) {
        console.error("エラー:", error);
        await showAlert('エラー', `読み込みエラーが発生しました:\n${error.message}`);
    }
}

// 行動トグル（HTMLのonclickから呼び出し）
window.toggleAction = function(id) {
    const human = state.humans.find(h => h.id === id);
    if (human) {
        const workAction = human.type === 'recruit' ? 'recruit' : 'labor';
        if (human.action === 'rest') human.action = workAction;
        else if (human.action === workAction) human.action = 'stealth';
        else human.action = 'rest';
        render();
        saveGame();
    }
};

// 洗脳ボタン処理
btnBrainwash.onclick = async () => {
    if (state.selectedHumanId === null) return;
    
    const humanIndex = state.humans.findIndex(h => h.id === state.selectedHumanId);
    if (humanIndex > -1) {
        const target = state.humans[humanIndex];
        
        if (state.alien.mp < target.willpower) return;

        state.alien.mp -= target.willpower;
        target.brainwash += 10;

        if (target.brainwash >= 100) {
            state.cultStats.followers += 1;
            if (target.influence) state.cultStats.followers += target.influence;
            state.cultStats.suspicion += 3;
            
            if (target.isBoss) {
                state.executives.push(target.uniqueData);
                state.currentStageIndex++;
                state.bossSpawned = false;
                await showAlert('【ステージクリア】', `${target.name}を完全に洗脳し、幹部として迎え入れました！`);
                
                if (state.currentStageIndex >= stageData.length) {
                    await showAlert('【地球征服完了】', 'おめでとうございます！全てのステージをクリアしました。');
                }
            }

            updateAlienPower(); 
            state.humans.splice(humanIndex, 1);
            state.selectedHumanId = null;
        }
        render();
        saveGame();
    }
};

// ターン終了処理
btnEndTurn.onclick = async () => {
    state.currentTurn++;
    state.alien.mp = Math.min(state.alien.maxMp, state.alien.mp + state.alien.regenMp);
    
    let baseSuspicionIncrease = 1;
    const currentHideout = hideoutData[state.hideoutLevel];
    const bonusMultiplier = (currentHideout && currentHideout.bonusMultiplier) ? currentHideout.bonusMultiplier : 1.0;
    
    state.humans.forEach(human => {
        let hpChange = 0;
        let fundAmount = 0;
        let recruitAmount = 0;
        let stealthAmount = 0;

        if (human.action === 'rest') {
            hpChange = 30;
        } else if (human.action === 'labor') {
            hpChange = -15;
            const baseDonation = Math.floor(human.labor * (human.brainwash / 5) * bonusMultiplier);
            if (baseDonation > 0) fundAmount = baseDonation;
        } else if (human.action === 'recruit') {
            hpChange = -15;
            const baseRecruit = Math.floor(human.recruit * (human.brainwash / 100) * bonusMultiplier);
            if (baseRecruit > 0) recruitAmount = baseRecruit;
        } else if (human.action === 'stealth') {
            hpChange = -25;
            stealthAmount = 5; 
        }

        human.hp = Math.min(human.maxHp, human.hp + hpChange);

        if (human.hp > 0) {
            if (fundAmount > 0) state.cultStats.funds += fundAmount;
            if (recruitAmount > 0) state.cultStats.followers += recruitAmount;
            if (stealthAmount > 0) state.cultStats.suspicion -= stealthAmount;
        }
    });

    state.cultStats.suspicion += baseSuspicionIncrease;

    // ランダムイベント処理（解放数に応じて発生確率が上昇：1個につき4%、最大25%）
    const eventChance = Math.min(0.25, state.collections.length * 0.04);
    if (Math.random() < eventChance) {
        const possibleEvents = eventData.filter(ev => {
            if (!state.collections.includes(ev.id)) return false;
            if (ev.effects.funds !== undefined && ev.effects.funds < 0) {
                return state.cultStats.funds >= Math.abs(ev.effects.funds);
            }
            return true;
        });

        if (possibleEvents.length > 0) {
            const ev = possibleEvents[Math.floor(Math.random() * possibleEvents.length)];
            if (ev.effects.funds) state.cultStats.funds = Math.max(0, state.cultStats.funds + ev.effects.funds);
            if (ev.effects.suspicion) state.cultStats.suspicion = Math.max(0, state.cultStats.suspicion + ev.effects.suspicion);
            if (ev.effects.alienMp) state.alien.mp = Math.min(state.alien.maxMp, state.alien.mp + ev.effects.alienMp);
            if (ev.effects.humanHp) state.humans.forEach(h => h.hp = Math.min(h.maxHp, h.hp + ev.effects.humanHp));
            if (ev.effects.humanBrainwash) state.humans.forEach(h => h.brainwash = Math.min(100, h.brainwash + ev.effects.humanBrainwash));
            
            await showAlert('【イベント発生】', ev.message);
        }
    }

    let escapedCount = 0;
    const nextHumans = [];

    for (const human of state.humans) {
        if (human.hp <= 0) {
            escapedCount++;
            if (state.selectedHumanId === human.id) state.selectedHumanId = null;
        } else if (human.brainwash >= 100) {
            state.cultStats.followers += 1;
            if (human.influence) state.cultStats.followers += human.influence;
            state.cultStats.suspicion += 3;
            
            if (human.isBoss) {
                state.executives.push(human.uniqueData);
                state.currentStageIndex++;
                state.bossSpawned = false;
                await showAlert('【ステージクリア】', `${human.name}を完全に洗脳し、幹部として迎え入れました！`);
                if (state.currentStageIndex >= stageData.length) {
                    await showAlert('【地球征服完了】', 'おめでとうございます！全てのステージをクリアしました。');
                }
            }
            if (state.selectedHumanId === human.id) state.selectedHumanId = null;
        } else {
            nextHumans.push(human);
        }
    }

    state.humans = nextHumans;
    updateAlienPower(); 

    if (escapedCount > 0) {
        const penalty = escapedCount * 20;
        state.cultStats.suspicion += penalty;
        await showAlert('【脱走発生】', `${escapedCount}人の人間が過酷な扱いに耐えかねて脱走しました！\n社会の警戒度が激増（+${penalty}）します！`);
    }

    state.cultStats.suspicion = Math.max(0, state.cultStats.suspicion);

    while (state.humans.length < state.unlockedSlots) {
        const boss = trySpawnBoss();
        if (boss) {
            state.humans.push(boss);
            await showAlert('【警告】', '条件を満たしたため、強力なターゲットがスロットに出現しました！');
        } else {
            state.humans.push(generateHuman());
        }
    }

    render();
    saveGame();
};

initGame();
