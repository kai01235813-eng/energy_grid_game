import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, CheckCircle, Factory, Radio, Building2, Zap } from 'lucide-react';

const Tutorial = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      id: 0,
      title: '🎮 Energy Genesis에 오신 것을 환영합니다!',
      description: '전력산업의 발전 과정을 체험하는 시뮬레이션 게임입니다.',
      content: (
        <div className="space-y-4">
          <p className="text-gray-300">
            석탄 발전 시대부터 AI 기반 스마트 그리드까지, 
            시대를 진화시키며 경남 지역에 안정적인 전력을 공급하세요.
          </p>
          <div className="bg-blue-900/30 border-l-4 border-blue-500 p-4 rounded">
            <p className="text-blue-200 text-sm">
              <strong>💡 목표:</strong> 5개 도시에 전력을 공급하고 시대를 진화시키세요!
            </p>
          </div>
        </div>
      )
    },
    {
      id: 1,
      title: '⚡ 건설 순서 (매우 중요!)',
      description: '건물을 올바른 순서로 건설해야 전력이 공급됩니다.',
      content: (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-yellow-900/50 to-orange-900/50 border-2 border-yellow-500 rounded-lg p-4">
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <Factory className="w-12 h-12 text-yellow-400 mx-auto mb-2" />
                <div className="text-lg font-bold text-white">1단계</div>
                <div className="text-sm text-gray-300">발전기</div>
              </div>
              <ChevronRight className="w-6 h-6 text-gray-400" />
              <div className="text-center">
                <Radio className="w-12 h-12 text-blue-400 mx-auto mb-2" />
                <div className="text-lg font-bold text-white">2단계</div>
                <div className="text-sm text-gray-300">송전탑</div>
              </div>
              <ChevronRight className="w-6 h-6 text-gray-400" />
              <div className="text-center">
                <Building2 className="w-12 h-12 text-green-400 mx-auto mb-2" />
                <div className="text-lg font-bold text-white">3단계</div>
                <div className="text-sm text-gray-300">변전소</div>
              </div>
            </div>
          </div>
          <div className="bg-red-900/30 border-l-4 border-red-500 p-4 rounded">
            <p className="text-red-200 text-sm">
              <strong>⚠️ 주의:</strong> 변전소를 먼저 지으면 연결할 송전탑이 없어서 전력이 공급되지 않습니다!
            </p>
          </div>
        </div>
      )
    },
    {
      id: 2,
      title: '🏭 1단계: 발전기 건설',
      description: '지도 왼쪽 또는 아래쪽에 발전기를 배치하세요.',
      content: (
        <div className="space-y-4">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-start gap-4">
              <div className="text-5xl">🏭</div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-yellow-400 mb-2">석탄 발전기</h3>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span><strong>출력:</strong> 50MW의 전력 생산</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span><strong>비용:</strong> ₩100</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span><strong>배치:</strong> 지도의 왼쪽이나 아래쪽 빈 공간 클릭</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="bg-blue-900/30 border-l-4 border-blue-500 p-4 rounded">
            <p className="text-blue-200 text-sm">
              💡 <strong>팁:</strong> 여러 개의 발전기를 건설하면 더 많은 전력을 생산할 수 있습니다!
            </p>
          </div>
        </div>
      )
    },
    {
      id: 3,
      title: '📡 2단계: 송전탑 건설',
      description: '발전기와 변전소를 연결할 송전탑을 배치하세요.',
      content: (
        <div className="space-y-4">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-start gap-4">
              <div className="text-5xl">🗼</div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-blue-400 mb-2">기본 송전탑</h3>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span><strong>범위:</strong> 150m (파란 원으로 표시)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span><strong>비용:</strong> ₩50</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span><strong>배치:</strong> 발전기와 도시 사이 중간 지점</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="bg-yellow-900/30 border-l-4 border-yellow-500 p-4 rounded">
            <p className="text-yellow-200 text-sm">
              💡 <strong>팁:</strong> 송전탑의 범위(150m) 내에 발전기가 있어야 합니다!
            </p>
          </div>
        </div>
      )
    },
    {
      id: 4,
      title: '🏢 3단계: 변전소 건설',
      description: '도시 근처에 변전소를 건설하면 자동으로 연결됩니다!',
      content: (
        <div className="space-y-4">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-start gap-4">
              <div className="text-5xl">🏢</div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-green-400 mb-2">기본 변전소</h3>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span><strong>용량:</strong> 100MW 처리 가능</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span><strong>비용:</strong> ₩150</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span><strong>배치:</strong> 도시(🏙️) 근처 150m 이내</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <span className="text-yellow-300"><strong>자동 연결:</strong> 범위 내 송전탑과 자동으로 전력선 생성!</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="bg-green-900/30 border-l-4 border-green-500 p-4 rounded">
            <p className="text-green-200 text-sm">
              ✅ <strong>성공!</strong> 변전소를 건설하면 파란색 전력선이 생성되고 도시에 불이 켜집니다!
            </p>
          </div>
        </div>
      )
    },
    {
      id: 5,
      title: '💰 수익과 진화',
      description: '전력을 공급하면 수익과 기술 포인트를 획득합니다.',
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-yellow-900/50 border-2 border-yellow-500 rounded-lg p-4">
              <div className="text-3xl mb-2">💵</div>
              <h3 className="text-lg font-bold text-yellow-400 mb-2">예산</h3>
              <p className="text-sm text-gray-300">
                전력 공급 도시당 3초마다 ₩10 획득
              </p>
            </div>
            <div className="bg-purple-900/50 border-2 border-purple-500 rounded-lg p-4">
              <div className="text-3xl mb-2">🎖️</div>
              <h3 className="text-lg font-bold text-purple-400 mb-2">기술 포인트</h3>
              <p className="text-sm text-gray-300">
                전력 공급 도시당 3초마다 1포인트 획득
              </p>
            </div>
          </div>
          <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 border-2 border-purple-500 rounded-lg p-4">
            <h3 className="text-lg font-bold text-white mb-2">🚀 시대 진화</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>• <strong>태동기 → 성장기:</strong> 기술 포인트 100 필요</li>
              <li>• <strong>성장기 → 혁신기:</strong> 기술 포인트 300 필요</li>
              <li>• 새로운 시대마다 더 강력한 건물과 기술 해금!</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 6,
      title: '🎮 이제 시작하세요!',
      description: '준비가 완료되었습니다. 경남에 전력을 공급해보세요!',
      content: (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-cyan-900 to-blue-900 border-2 border-cyan-500 rounded-lg p-6 text-center">
            <div className="text-6xl mb-4">⚡</div>
            <h3 className="text-2xl font-bold text-white mb-4">게임을 시작하세요!</h3>
            <p className="text-gray-300 mb-4">
              우측 상단의 "게임 매뉴얼" 버튼을 클릭하면 언제든지 자세한 가이드를 볼 수 있습니다.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="bg-gray-800/50 rounded p-3">
              <div className="text-2xl mb-1">📚</div>
              <div className="text-gray-400">게임 매뉴얼</div>
            </div>
            <div className="bg-gray-800/50 rounded p-3">
              <div className="text-2xl mb-1">🧠</div>
              <div className="text-gray-400">기술 연구</div>
            </div>
            <div className="bg-gray-800/50 rounded p-3">
              <div className="text-2xl mb-1">⚙️</div>
              <div className="text-gray-400">설정/디버그</div>
            </div>
          </div>
        </div>
      )
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-gradient-to-br from-gray-900 via-slate-900 to-gray-800 border-4 border-cyan-500 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-cyan-900 to-blue-900 border-b-4 border-cyan-500 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">{steps[currentStep].title}</h2>
            <button
              onClick={onSkip}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <p className="text-cyan-200">{steps[currentStep].description}</p>
          
          {/* 진행 상황 */}
          <div className="mt-4 flex gap-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`flex-1 h-1 rounded-full transition-colors ${
                  index <= currentStep ? 'bg-cyan-400' : 'bg-gray-700'
                }`}
              />
            ))}
          </div>
        </div>

        {/* 컨텐츠 */}
        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {steps[currentStep].content}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 하단 버튼 */}
        <div className="border-t-2 border-gray-700 p-6 flex items-center justify-between bg-gray-900/50">
          <button
            onClick={onSkip}
            className="text-gray-400 hover:text-white transition-colors"
          >
            건너뛰기
          </button>
          
          <div className="flex gap-3">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                이전
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-bold transition-colors flex items-center gap-2"
            >
              {currentStep < steps.length - 1 ? (
                <>
                  다음
                  <ChevronRight className="w-5 h-5" />
                </>
              ) : (
                <>
                  시작하기
                  <CheckCircle className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Tutorial;
