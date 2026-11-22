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
    collections: [] // 購入済みコレクションのIDリスト
};

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
