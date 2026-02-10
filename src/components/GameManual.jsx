import React from 'react';
import { motion } from 'framer-motion';
import { 
  Book, X, Zap, Factory, Radio, Building2, TrendingUp, 
  Brain, DollarSign, Target, Award, AlertTriangle, Sparkles,
  ChevronRight, Eye, FileText, Wind, Sun, Shield
} from 'lucide-react';

const GameManual = ({ onClose }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gradient-to-br from-gray-900 via-slate-900 to-gray-800 border-4 border-cyan-500 rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="sticky top-0 bg-gradient-to-r from-cyan-900 to-blue-900 border-b-4 border-cyan-500 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Book className="w-8 h-8 text-cyan-400" />
            <h1 className="text-3xl font-bold text-white">Energy Genesis 게임 매뉴얼</h1>
          </div>
          <button
            onClick={onClose}
            className="bg-red-600 hover:bg-red-500 text-white p-2 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-8">
          {/* 게임 개요 */}
          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
              <Sparkles className="w-6 h-6" />
              게임 개요
            </h2>
            <div className="bg-gray-800/50 rounded-lg p-6 border-2 border-gray-700">
              <p className="text-gray-300 text-lg leading-relaxed">
                <strong className="text-white">Energy Genesis</strong>는 전력산업의 발전 과정을 체험하는 시뮬레이션 RPG입니다. 
                석탄 발전 시대부터 AI 기반 스마트 그리드까지, 시대를 진화시키며 경남 지역에 안정적인 전력을 공급하세요.
              </p>
            </div>
          </section>

          {/* 게임 목표 */}
          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
              <Target className="w-6 h-6" />
              게임 목표
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-yellow-900 to-orange-900 border-2 border-yellow-500 rounded-lg p-4">
                <div className="text-3xl mb-2">⚡</div>
                <h3 className="text-lg font-bold text-white mb-2">전력 공급</h3>
                <p className="text-sm text-gray-300">5개 도시에 안정적인 전력을 공급하여 공급률 100%를 달성하세요.</p>
              </div>
              <div className="bg-gradient-to-br from-purple-900 to-pink-900 border-2 border-purple-500 rounded-lg p-4">
                <div className="text-3xl mb-2">🚀</div>
                <h3 className="text-lg font-bold text-white mb-2">시대 진화</h3>
                <p className="text-sm text-gray-300">기술 포인트를 모아 태동기 → 성장기 → 혁신기로 진화하세요.</p>
              </div>
              <div className="bg-gradient-to-br from-blue-900 to-cyan-900 border-2 border-blue-500 rounded-lg p-4">
                <div className="text-3xl mb-2">🧠</div>
                <h3 className="text-lg font-bold text-white mb-2">기술 연구</h3>
                <p className="text-sm text-gray-300">AI, 디지털 트윈 등 첨단 기술을 연구하여 효율을 극대화하세요.</p>
              </div>
            </div>
          </section>

          {/* 건설 순서 */}
          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
              <ChevronRight className="w-6 h-6" />
              건설 순서 (중요!)
            </h2>
            <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 border-2 border-blue-500 rounded-lg p-6">
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <div className="text-center">
                  <Factory className="w-16 h-16 text-yellow-400 mx-auto mb-2" />
                  <div className="text-xl font-bold text-white">1. 발전기</div>
                  <div className="text-sm text-gray-400">전력 생산</div>
                </div>
                <ChevronRight className="w-8 h-8 text-gray-400" />
                <div className="text-center">
                  <Radio className="w-16 h-16 text-blue-400 mx-auto mb-2" />
                  <div className="text-xl font-bold text-white">2. 송전탑</div>
                  <div className="text-sm text-gray-400">전력 전송</div>
                </div>
                <ChevronRight className="w-8 h-8 text-gray-400" />
                <div className="text-center">
                  <Building2 className="w-16 h-16 text-green-400 mx-auto mb-2" />
                  <div className="text-xl font-bold text-white">3. 변전소</div>
                  <div className="text-sm text-gray-400">자동 연결!</div>
                </div>
              </div>
              <div className="mt-4 bg-yellow-900/30 border-l-4 border-yellow-500 p-4 rounded">
                <p className="text-yellow-200 text-sm">
                  <strong>💡 팁:</strong> 변전소를 건설하면 범위 내의 송전탑과 자동으로 연결됩니다. 
                  송전탑도 범위 내의 발전기와 자동 연결되어 전력선이 생성됩니다!
                </p>
              </div>
            </div>
          </section>

          {/* 시대별 특징 */}
          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
              <TrendingUp className="w-6 h-6" />
              시대별 특징
            </h2>
            <div className="space-y-4">
              {/* 태동기 */}
              <div className="bg-gradient-to-r from-gray-800 to-gray-900 border-2 border-gray-500 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="text-5xl">🏭</div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-300 mb-2">태동기 (1900s)</h3>
                    <p className="text-gray-400 mb-3">석탄 발전과 초기 송전 시대</p>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="bg-gray-700/50 rounded p-2">
                        <div className="text-gray-400">발전기</div>
                        <div className="text-white font-bold">석탄 (50MW)</div>
                      </div>
                      <div className="bg-gray-700/50 rounded p-2">
                        <div className="text-gray-400">송전탑</div>
                        <div className="text-white font-bold">기본 (150m)</div>
                      </div>
                      <div className="bg-gray-700/50 rounded p-2">
                        <div className="text-gray-400">변전소</div>
                        <div className="text-white font-bold">기본 (100MW)</div>
                      </div>
                    </div>
                    <div className="mt-3 bg-blue-900/30 border-l-4 border-blue-500 p-2 rounded">
                      <p className="text-blue-200 text-sm">
                        <strong>진화 조건:</strong> 전력 공급률 50% + 기술 포인트 100
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 성장기 */}
              <div className="bg-gradient-to-r from-blue-900 to-blue-800 border-2 border-blue-500 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="text-5xl">⚡</div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-blue-300 mb-2">성장기 (1960s)</h3>
                    <p className="text-blue-200 mb-3">대형 발전소와 고압 송전 시대</p>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="bg-blue-700/50 rounded p-2">
                        <div className="text-blue-300">발전기</div>
                        <div className="text-white font-bold">석유 (150MW)</div>
                      </div>
                      <div className="bg-blue-700/50 rounded p-2">
                        <div className="text-blue-300">송전탑</div>
                        <div className="text-white font-bold">고압 (250m)</div>
                      </div>
                      <div className="bg-blue-700/50 rounded p-2">
                        <div className="text-blue-300">변전소</div>
                        <div className="text-white font-bold">자동화 (300MW)</div>
                      </div>
                    </div>
                    <div className="mt-3 bg-purple-900/30 border-l-4 border-purple-500 p-2 rounded">
                      <p className="text-purple-200 text-sm">
                        <strong>진화 조건:</strong> 전력 공급률 80% + 기술 포인트 300
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 혁신기 */}
              <div className="bg-gradient-to-r from-green-900 to-emerald-900 border-2 border-green-500 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="text-5xl">🚀</div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-green-300 mb-2">혁신기 (2020s)</h3>
                    <p className="text-green-200 mb-3">신재생 에너지와 AI 전력망 시대</p>
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      <div className="bg-green-700/50 rounded p-2">
                        <div className="text-green-300">태양광</div>
                        <div className="text-white font-bold">100MW</div>
                      </div>
                      <div className="bg-green-700/50 rounded p-2">
                        <div className="text-green-300">풍력</div>
                        <div className="text-white font-bold">120MW</div>
                      </div>
                      <div className="bg-green-700/50 rounded p-2">
                        <div className="text-green-300">스마트탑</div>
                        <div className="text-white font-bold">300m</div>
                      </div>
                      <div className="bg-green-700/50 rounded p-2">
                        <div className="text-green-300">AI변전소</div>
                        <div className="text-white font-bold">600MW</div>
                      </div>
                    </div>
                    <div className="mt-3 bg-green-900/30 border-l-4 border-green-500 p-2 rounded">
                      <p className="text-green-200 text-sm">
                        <strong>특징:</strong> 친환경 에너지 + AI 자동 복구 + 디지털 트윈 예측
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 기술 트리 */}
          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
              <Brain className="w-6 h-6" />
              기술 트리
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-purple-900 to-blue-900 border-2 border-purple-500 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <FileText className="w-8 h-8 text-purple-400 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">RAG 검색 증강</h3>
                    <p className="text-sm text-gray-300 mb-2">운영 매뉴얼 자동 검색으로 복구 시간 20% 단축</p>
                    <div className="text-purple-400 font-bold">💎 50 포인트 | 성장기</div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-cyan-900 to-blue-900 border-2 border-cyan-500 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Eye className="w-8 h-8 text-cyan-400 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">디지털 트윈</h3>
                    <p className="text-sm text-gray-300 mb-2">설비 고장 예측 확률 50% 증가</p>
                    <div className="text-cyan-400 font-bold">💎 100 포인트 | 혁신기</div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-pink-900 to-purple-900 border-2 border-pink-500 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Brain className="w-8 h-8 text-pink-400 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Agentic AI</h3>
                    <p className="text-sm text-gray-300 mb-2">사고 발생 시 자동 복구 시스템 활성화</p>
                    <div className="text-pink-400 font-bold">💎 150 포인트 | 혁신기</div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-yellow-900 to-orange-900 border-2 border-yellow-500 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-8 h-8 text-yellow-400 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">OCR/IDP 자동화</h3>
                    <p className="text-sm text-gray-300 mb-2">문서 처리 자동화로 운영 비용 15% 절감</p>
                    <div className="text-yellow-400 font-bold">💎 80 포인트 | 혁신기</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 게임 시스템 */}
          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
              <Award className="w-6 h-6" />
              게임 시스템
            </h2>
            <div className="space-y-4">
              <div className="bg-yellow-900/30 border-2 border-yellow-500 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <DollarSign className="w-6 h-6 text-yellow-400 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-bold text-white mb-2">예산 관리</h3>
                    <p className="text-gray-300 text-sm">
                      • 초기 예산: ₩500<br/>
                      • 수입: 전력 공급 중인 도시당 3초마다 ₩10 획득<br/>
                      • 지출: 건물 건설 비용
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-purple-900/30 border-2 border-purple-500 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Award className="w-6 h-6 text-purple-400 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-bold text-white mb-2">기술 포인트</h3>
                    <p className="text-gray-300 text-sm">
                      • 획득: 전력 공급 중인 도시당 3초마다 1포인트<br/>
                      • 용도: 시대 진화 및 기술 연구<br/>
                      • 태동기→성장기: 100포인트 | 성장기→혁신기: 300포인트
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-red-900/30 border-2 border-red-500 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-bold text-white mb-2">건물 고장 시스템</h3>
                    <p className="text-gray-300 text-sm">
                      • 랜덤으로 건물 고장 발생 (15초마다 10% 확률)<br/>
                      • 디지털 트윈: 고장 50% 사전 예측<br/>
                      • Agentic AI: 고장 시 자동 복구
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 플레이 팁 */}
          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
              <Zap className="w-6 h-6" />
              플레이 팁
            </h2>
            <div className="bg-gradient-to-br from-cyan-900/50 to-blue-900/50 border-2 border-cyan-500 rounded-lg p-6">
              <div className="space-y-3 text-gray-300">
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">💡</span>
                  <p><strong className="text-white">발전기 우선 배치:</strong> 지도 왼쪽(발전 가능 지역)에 발전기를 먼저 건설하세요.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">📡</span>
                  <p><strong className="text-white">송전탑 연결망:</strong> 발전기와 변전소 사이에 송전탑을 배치하여 연결망을 구축하세요.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">🏙️</span>
                  <p><strong className="text-white">도시 근처 변전소:</strong> 변전소는 도시(🏙️) 근처 150m 이내에 건설해야 전력을 공급할 수 있습니다.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">⚡</span>
                  <p><strong className="text-white">전력선 확인:</strong> 파란색 전력선이 생성되면 연결 성공! 전력이 흐르는 것을 확인하세요.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">🚀</span>
                  <p><strong className="text-white">빠른 진화:</strong> 여러 도시에 동시에 전력을 공급하면 기술 포인트를 빠르게 모을 수 있습니다.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">🧠</span>
                  <p><strong className="text-white">기술 투자:</strong> Agentic AI를 먼저 연구하면 건물 고장 걱정 없이 플레이할 수 있습니다.</p>
                </div>
              </div>
            </div>
          </section>

          {/* 재난 대응 모드 */}
          <section>
            <h2 className="text-2xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
              <Shield className="w-6 h-6" />
              AI 재난대응 시스템
            </h2>
            <div className="bg-gradient-to-br from-red-900/50 to-orange-900/50 border-2 border-red-500 rounded-lg p-6">
              <p className="text-gray-300 mb-4">
                Energy Genesis와 별도로 재난 대응 시뮬레이션 모드를 플레이할 수 있습니다.
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-800/50 rounded p-3">
                  <div className="text-blue-400 font-bold mb-1">🌧️ 기상 이벤트</div>
                  <div className="text-gray-400">집중호우, 산불, 낙뢰, 태풍, 폭설</div>
                </div>
                <div className="bg-gray-800/50 rounded p-3">
                  <div className="text-green-400 font-bold mb-1">🤖 AI 권고</div>
                  <div className="text-gray-400">상황별 대응 전략 추천</div>
                </div>
                <div className="bg-gray-800/50 rounded p-3">
                  <div className="text-yellow-400 font-bold mb-1">⚡ 자원 관리</div>
                  <div className="text-gray-400">수리 크루, 예산, 비상 전원</div>
                </div>
                <div className="bg-gray-800/50 rounded p-3">
                  <div className="text-purple-400 font-bold mb-1">📊 실시간 모니터링</div>
                  <div className="text-gray-400">변전소 상태 및 정전 현황</div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* 하단 */}
        <div className="sticky bottom-0 bg-gradient-to-t from-gray-900 to-transparent p-6">
          <button
            onClick={onClose}
            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white py-4 rounded-lg font-bold text-lg transition-colors"
          >
            게임 시작하기
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default GameManual;
