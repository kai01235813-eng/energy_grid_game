import React from 'react';
import { motion } from 'framer-motion';
import { Zap, Sparkles } from 'lucide-react';

const GridReconnectedEffect = ({ onComplete }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
    >
      {/* 배경 플래시 */}
      <motion.div
        className="absolute inset-0 bg-cyber-blue"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.3, 0] }}
        transition={{ duration: 1.5 }}
      />

      {/* 파티클 효과 */}
      {[...Array(100)].map((_, i) => {
        const angle = (Math.PI * 2 * i) / 100;
        const distance = 200 + Math.random() * 300;
        
        return (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-cyber-gold rounded-full"
            style={{
              left: '50%',
              top: '50%',
            }}
            initial={{ 
              x: 0, 
              y: 0, 
              scale: 0,
              opacity: 1,
            }}
            animate={{
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance,
              scale: [0, 1.5, 0],
              opacity: [1, 1, 0],
            }}
            transition={{
              duration: 2,
              ease: 'easeOut',
              delay: Math.random() * 0.3,
            }}
          />
        );
      })}

      {/* 중앙 메시지 */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ 
          type: 'spring',
          stiffness: 200,
          damping: 15,
          delay: 0.3,
        }}
        className="relative z-10 text-center"
      >
        <motion.div
          animate={{ 
            rotate: [0, 360],
          }}
          transition={{ 
            duration: 2,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="inline-block mb-4"
        >
          <Zap className="w-32 h-32 text-cyber-gold" strokeWidth={3} />
        </motion.div>

        <motion.h1
          className="text-7xl font-bold mb-4"
          style={{
            background: 'linear-gradient(to right, #00d4ff, #ffd700)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 0 40px rgba(0, 212, 255, 0.8)',
          }}
          animate={{
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
          }}
        >
          GRID RECONNECTED
        </motion.h1>

        <motion.p
          className="text-2xl text-white"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          경남에 다시 빛이 돌아왔습니다!
        </motion.p>

        {/* 장식 요소 */}
        <div className="flex justify-center gap-8 mt-8">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 + i * 0.1 }}
            >
              <Sparkles 
                className="w-8 h-8 text-cyber-gold" 
                style={{
                  filter: `hue-rotate(${i * 30}deg)`,
                }}
              />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* 자동 종료 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0 }}
        transition={{ delay: 3, duration: 0.5 }}
        onAnimationComplete={onComplete}
      />
    </motion.div>
  );
};

export default GridReconnectedEffect;
