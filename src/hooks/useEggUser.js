import { useState, useEffect } from 'react';
import { GAME_CONFIG } from '../constants/gameConfig';

/**
 * useEggUser - 유저 데이터 관리 훅
 * 추후 JWT 토큰 및 API 연동 대비 추상화
 */
export const useEggUser = () => {
  const [user, setUser] = useState(() => {
    // Local Storage에서 유저 데이터 로드
    const saved = localStorage.getItem('egg_user');
    if (saved) {
      return JSON.parse(saved);
    }
    
    // 초기 유저 데이터
    return {
      id: 'local_user_001',
      name: 'Energy Guardian',
      exp: GAME_CONFIG.INITIAL_EXP,
      coins: GAME_CONFIG.INITIAL_COINS,
      selectedRegion: null,
      completedTutorial: false,
      jwt: null, // 추후 kepco-ai-zone 연동용
    };
  });

  // 유저 데이터 변경 시 Local Storage 저장
  useEffect(() => {
    localStorage.setItem('egg_user', JSON.stringify(user));
  }, [user]);

  // EXP → 코인 환전
  const convertExpToCoins = (expAmount) => {
    if (user.exp < expAmount) {
      return { success: false, message: 'EXP가 부족합니다.' };
    }

    const coins = expAmount * GAME_CONFIG.EXP_TO_COIN_RATIO;
    setUser(prev => ({
      ...prev,
      exp: prev.exp - expAmount,
      coins: prev.coins + coins,
    }));

    return { success: true, coins };
  };

  // 코인 소비 (건물 구매 등)
  const spendCoins = (amount) => {
    if (user.coins < amount) {
      return { success: false, message: '코인이 부족합니다.' };
    }

    setUser(prev => ({
      ...prev,
      coins: prev.coins - amount,
    }));

    return { success: true };
  };

  // 지역 선택
  const selectRegion = (regionId) => {
    setUser(prev => ({
      ...prev,
      selectedRegion: regionId,
    }));
  };

  // 튜토리얼 완료
  const completeTutorial = () => {
    setUser(prev => ({
      ...prev,
      completedTutorial: true,
    }));
  };

  // EXP 획득 (추후 API 연동용)
  const gainExp = (amount) => {
    setUser(prev => ({
      ...prev,
      exp: prev.exp + amount,
    }));
  };

  return {
    user,
    convertExpToCoins,
    spendCoins,
    selectRegion,
    completeTutorial,
    gainExp,
    setUser,
  };
};
