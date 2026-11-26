import { state, saveGame, loadGame, computeGrowthRate, isActionLocked } from './state.js?v=4';
import { loadData, stageData, eventData, hideoutData, generateHuman, trySpawnBoss, getStageGrowthMultiplier, scaleFunds, migrateClearedSave } from './stage.js?v=4';
import { showAlert, updateAlienPower, render } from './ui.js?v=4';
import { initModals } from './modals.js?v=4';

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
            if (migrateClearedSave()) saveGame();
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
    if (human && isActionLocked(human)) return; // 行動不可（ボス自身／ボスの抵抗スキルでロック中の仲間）
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
            if (target.influence) state.growthBonus = (state.growthBonus || 0) + target.influence * 0.0005;
            state.cultStats.suspicion += 3;
            
            if (target.isBoss) {
                state.executives.push(target.uniqueData);
                await showAlert('【ステージクリア】', `${target.name}を完全に洗脳し、幹部として迎え入れました！`);

                if (state.currentStageIndex >= stageData.length - 1) {
                    state.gameCleared = true;
                    state.bossSpawned = true; // 最終ボスは再出現させない
                    await showAlert('【地球征服完了】', 'おめでとうございます！全てのステージをクリアしました。');
                } else {
                    state.currentStageIndex++;
                    state.bossSpawned = false;
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
        if (isActionLocked(human)) return; // 行動不可の人間は働かない（HPも減らないので脱走もしない）
        let hpChange = 0;
        let fundAmount = 0;
        let recruitAmount = 0;
        let stealthAmount = 0;

        if (human.action === 'rest') {
            hpChange = 30;
        } else if (human.action === 'labor') {
            hpChange = -15;
            const baseDonation = Math.floor(human.labor * (human.brainwash / 10) * bonusMultiplier * getStageGrowthMultiplier());
            if (baseDonation > 0) fundAmount = baseDonation;
        } else if (human.action === 'recruit') {
            hpChange = -15;
            // 勧誘は信者成長率への貢献として処理（computeGrowthRate参照）
        } else if (human.action === 'stealth') {
            hpChange = -25;
            stealthAmount = 5; 
        }

        human.hp = Math.min(human.maxHp, human.hp + hpChange);

        if (human.hp > 0) {
            if (fundAmount > 0) state.cultStats.funds += fundAmount;
            if (stealthAmount > 0) state.cultStats.suspicion -= stealthAmount;
        }
    });

    // 信者の複利成長（信者が信者を呼ぶ）
    if (state.cultStats.followers > 0) {
        state.cultStats.followers += state.cultStats.followers * computeGrowthRate();
    }

    state.cultStats.suspicion += baseSuspicionIncrease;

    // ボスの抵抗スキル（洗脳が進行中＝洗脳度1〜99%のボスのみ発動）
    state.humans.forEach(human => {
        if (!human.isBoss || !human.uniqueData?.resistSkill) return;
        if (human.brainwash <= 0 || human.brainwash >= 100) return;
        const eff = human.uniqueData.resistSkill.effect || {};
        if (eff.brainwashDecay) human.brainwash = Math.max(0, human.brainwash - eff.brainwashDecay);
        if (eff.suspicion) state.cultStats.suspicion += eff.suspicion;
        if (eff.mpDrain) state.alien.mp = Math.max(0, state.alien.mp - eff.mpDrain);
        if (eff.allyBrainwashDecay) {
            state.humans.forEach(other => {
                if (other !== human && !other.isBoss && other.brainwash > 0 && other.brainwash < 100) {
                    other.brainwash = Math.max(0, other.brainwash - eff.allyBrainwashDecay);
                }
            });
        }
        if (eff.allyHpZeroOnce && !human.resistFired) {
            const targets = state.humans.filter(o => o !== human && !o.isBoss);
            if (targets.length > 0) {
                const target = targets.reduce((a, b) => (b.hp < a.hp ? b : a));
                target.hp = 0;
                human.resistFired = true;
            }
        }
    });

    // ランダムイベント処理（解放数に応じて発生確率が上昇：1個につき4%、最大25%）
    const eventChance = Math.min(0.25, state.collections.length * 0.04);
    if (Math.random() < eventChance) {
        const possibleEvents = eventData.filter(ev => {
            if (!state.collections.includes(ev.id)) return false;
            if (ev.effects.funds !== undefined && ev.effects.funds < 0) {
                return state.cultStats.funds >= Math.abs(scaleFunds(ev.effects.funds));
            }
            return true;
        });

        if (possibleEvents.length > 0) {
            const ev = possibleEvents[Math.floor(Math.random() * possibleEvents.length)];
            const applied = [];
            if (ev.effects.funds) {
                const amt = scaleFunds(ev.effects.funds);
                state.cultStats.funds = Math.max(0, state.cultStats.funds + amt);
                applied.push(`資金 ${amt >= 0 ? '+' : ''}${amt.toLocaleString()}`);
            }
            if (ev.effects.suspicion) {
                state.cultStats.suspicion = Math.max(0, state.cultStats.suspicion + ev.effects.suspicion);
                applied.push(`警戒度 ${ev.effects.suspicion >= 0 ? '+' : ''}${ev.effects.suspicion}`);
            }
            if (ev.effects.alienMpPercent) {
                const before = state.alien.mp;
                state.alien.mp = Math.min(state.alien.maxMp, state.alien.mp + Math.floor(state.alien.maxMp * ev.effects.alienMpPercent));
                applied.push(`精神力 +${state.alien.mp - before}`);
            }
            if (ev.effects.humanHp) {
                state.humans.forEach(h => h.hp = Math.min(h.maxHp, h.hp + ev.effects.humanHp));
                applied.push(ev.effects.humanHp >= 999 ? '全員の体力 全回復' : `全員の体力 ${ev.effects.humanHp}`);
            }
            if (ev.effects.humanBrainwash) {
                state.humans.forEach(h => h.brainwash = Math.min(100, h.brainwash + ev.effects.humanBrainwash));
                applied.push(`全員の洗脳度 +${ev.effects.humanBrainwash}`);
            }

            await showAlert('【イベント発生】', applied.length > 0 ? `${ev.message}\n\n【効果】${applied.join(' / ')}` : ev.message);
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
            if (human.influence) state.growthBonus = (state.growthBonus || 0) + human.influence * 0.0005;
            state.cultStats.suspicion += 3;
            
            if (human.isBoss) {
                state.executives.push(human.uniqueData);
                await showAlert('【ステージクリア】', `${human.name}を完全に洗脳し、幹部として迎え入れました！`);
                if (state.currentStageIndex >= stageData.length - 1) {
                    state.gameCleared = true;
                    state.bossSpawned = true; // 最終ボスは再出現させない
                    await showAlert('【地球征服完了】', 'おめでとうございます！全てのステージをクリアしました。');
                } else {
                    state.currentStageIndex++;
                    state.bossSpawned = false;
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
