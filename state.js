export const state = {
    currentTurn: 1,
    alien: { mp: 100, maxMp: 100, regenMp: 10 },
    cultStats: { followers: 0, funds: 0, suspicion: 0 },
    unlockedSlots: 1,
    humans: [],
    selectedHumanId: null,
    currentStageIndex: 0,
    bossSpawned: false,
    executives: [],
    hideoutLevel: 0,
    collections: [], // 購入済みコレクションのIDリスト
    growthBonus: 0 // 信者成長率への永続ボーナス（政財界の影響力・幹部スキルで蓄積）
};

// 信者の成長率（1ターンあたりの割合）。基本2% + 永続ボーナス + 勧誘担当の貢献
export function computeGrowthRate() {
    let rate = 0.02 + (state.growthBonus || 0);
    state.humans.forEach(h => {
        if (h.action === 'recruit' && h.hp > 0) {
            rate += h.recruit * (h.brainwash / 100) * 0.002;
        }
    });
    return rate;
}

export const MAX_SLOTS = 4;
export const SAVE_KEY = 'silent_like_creeping_water_save';

export function saveGame() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function loadGame() {
    const savedString = localStorage.getItem(SAVE_KEY);
    if (savedString) {
        try {
            const data = JSON.parse(savedString);
            Object.assign(state, data);
            
            if (state.currentStageIndex === undefined) state.currentStageIndex = 0;
            if (state.bossSpawned === undefined) state.bossSpawned = false;
            if (state.executives === undefined) state.executives = []; 
            if (state.hideoutLevel === undefined) state.hideoutLevel = 0;
            if (state.growthBonus === undefined) state.growthBonus = 0;
            if (state.collections === undefined) state.collections = [];
            
            if (state.unlockedSlots > MAX_SLOTS) state.unlockedSlots = MAX_SLOTS;
            if (state.humans.length > MAX_SLOTS) state.humans = state.humans.slice(0, MAX_SLOTS);
            
            state.selectedHumanId = null;
            return true;
        } catch (e) {
            console.error('セーブデータの読み込みエラー', e);
        }
    }
    return false;
}

export function resetGame() {
    if (confirm("セーブデータを消去して、最初からやり直しますか？")) {
        localStorage.removeItem(SAVE_KEY);
        location.reload();
    }
}
