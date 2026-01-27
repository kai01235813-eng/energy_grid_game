import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, TrendingUp, X, ArrowRight } from 'lucide-react';
import { GAME_CONFIG } from '../constants/gameConfig';

const EconomyPanel = ({ user, onConvertExp, onSpendCoins }) => {
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [expAmount, setExpAmount] = useState(100);

  const handleConvert = () => {
    const result = onConvertExp(expAmount);
    if (result.success) {
      setShowConvertModal(false);
      setExpAmount(100);
    }
  };

  const coinsFromExp = expAmount * GAME_CONFIG.EXP_TO_COIN_RATIO;

  return (
    <>
      {/* 상단 경제 패널 */}
      <div className="absolute top-4 left-4 z-20 space-y-2">
        {/* EXP 표시 */}
        <motion.div
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="bg-cyber-dark bg-opacity-90 border-2 border-cyber-purple rounded-lg px-6 py-3 flex items-center gap-3"
        >
          <TrendingUp className="w-6 h-6 text-cyber-purple" />
          <div>
            <p className="text-xs text-gray-400">경험치</p>
            <p className="text-2xl font-bold text-cyber-purple">
              {user.exp.toLocaleString()} EXP
            </p>
          </div>
        </motion.div>

        {/* 코인 표시 */}
        <motion.div
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-cyber-dark bg-opacity-90 border-2 border-cyber-gold rounded-lg px-6 py-3 flex items-center gap-3"
        >
          <Coins className="w-6 h-6 text-cyber-gold" />
          <div>
            <p className="text-xs text-gray-400">코인</p>
            <p className="text-2xl font-bold text-cyber-gold">
              {user.coins.toLocaleString()}
            </p>
          </div>
        </motion.div>

        {/* 환전 버튼 */}
        <motion.button
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.05, x: 5 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowConvertModal(true)}
          className="w-full bg-gradient-to-r from-cyber-purple to-cyber-gold text-white font-bold py-3 rounded-lg text-sm"
        >
          EXP → 코인 환전
        </motion.button>
      </div>

      {/* 환전 모달 */}
      <AnimatePresence>
        {showConvertModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50"
            onClick={() => setShowConvertModal(false)}
          >
            <motion.div
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 50 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-cyber-dark border-4 border-cyber-gold rounded-2xl p-8 max-w-md w-full mx-4"
            >
              <button
                onClick={() => setShowConvertModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>

              <h2 className="text-3xl font-bold glow-gold mb-6 text-center">
                EXP 환전소
              </h2>

              {/* 환율 정보 */}
              <div className="bg-cyber-darker rounded-lg p-4 mb-6">
                <p className="text-center text-gray-400 text-sm mb-2">환율</p>
                <p className="text-center text-2xl font-bold text-cyber-gold">
                  1 EXP = {GAME_CONFIG.EXP_TO_COIN_RATIO} Coins
                </p>
              </div>

              {/* 환전 입력 */}
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-2">
                  환전할 EXP (보유: {user.exp.toLocaleString()})
                </label>
                <input
                  type="number"
                  value={expAmount}
                  onChange={(e) => setExpAmount(Math.max(0, parseInt(e.target.value) || 0))}
                  min="0"
                  max={user.exp}
                  className="w-full bg-cyber-darker border-2 border-cyber-purple rounded-lg px-4 py-3 text-white text-xl font-bold focus:border-cyber-gold focus:outline-none"
                />
                
                {/* 빠른 선택 */}
                <div className="flex gap-2 mt-3">
                  {[100, 500, 1000].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setExpAmount(Math.min(amount, user.exp))}
                      className="flex-1 bg-cyber-darker border border-cyber-blue rounded px-3 py-2 text-sm hover:bg-cyber-blue hover:bg-opacity-20 transition-colors"
                    >
                      {amount}
                    </button>
                  ))}
                  <button
                    onClick={() => setExpAmount(user.exp)}
                    className="flex-1 bg-cyber-darker border border-cyber-red rounded px-3 py-2 text-sm hover:bg-cyber-red hover:bg-opacity-20 transition-colors"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* 결과 미리보기 */}
              <div className="bg-cyber-blue bg-opacity-10 border border-cyber-blue rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="text-center flex-1">
                    <p className="text-xs text-gray-400 mb-1">차감</p>
                    <p className="text-xl font-bold text-cyber-purple">
                      -{expAmount.toLocaleString()} EXP
                    </p>
                  </div>
                  
                  <ArrowRight className="w-6 h-6 text-cyber-blue" />
                  
                  <div className="text-center flex-1">
                    <p className="text-xs text-gray-400 mb-1">획득</p>
                    <p className="text-xl font-bold text-cyber-gold">
                      +{coinsFromExp.toLocaleString()} 코인
                    </p>
                  </div>
                </div>
              </div>

              {/* 환전 버튼 */}
              <button
                onClick={handleConvert}
                disabled={expAmount <= 0 || expAmount > user.exp}
                className="w-full bg-gradient-to-r from-cyber-purple to-cyber-gold text-white font-bold text-lg py-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-shadow"
                style={{
                  boxShadow: '0 0 30px rgba(255, 215, 0, 0.3)',
                }}
              >
                환전하기
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default EconomyPanel;
