import { useState, useRef, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'

const LOADING_STEPS = [
  ['SCANNING CARD...', 'Identifying card name, set, and edition'],
  ['ANALYZING CONDITION...', 'Evaluating centering, corners, edges, and surface'],
  ['ESTIMATING GRADES...', 'Calculating expected grade across PSA, BGS, CGC, ACE'],
  ['FETCHING PRICES...', 'Looking up current market values for each grade tier'],
]

const GRADER_FEES = { PSA: 25, BGS: 22, CGC: 18, ACE: 15 }
const PLATFORM_FEES = { eBay: 0.1325, TCGPlayer: 0.1075, Facebook: 0.05, Local: 0 }

function gradeColorClass(grade) {
  const g = parseFloat(grade)
  if (g >= 10) return 'grade-10'
  if (g >= 9)  return 'grade-9'
  if (g >= 8)  return 'grade-8'
  return 'grade-7'
}

// Compress + resize before encoding — keeps payload well under Vercel's 4.5MB limit
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const MAX = 1200
        let { width, height } = img
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX }
          else                { width = Math.round((width * MAX) / height);  height = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        resolve({ data: dataUrl.split(',')[1], mediaType: 'image/jpeg' })
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// Parse a price string like "$312.00" or "312" → number
function parsePriceString(str) {
  if (!str) return 0
  return parseFloat(String(str).replace(/[^0-9.]/g, '')) || 0
}

// Build calc rows from AI results for a given grader
function buildCalcFromResults(results, graderName) {
  if (!results) return null
  const grader = results.graders?.find(g => g.name === graderName)
  if (!grader) return null
  const highlighted = grader.prices?.find(p => p.highlighted)
  return {
    sellPrice: highlighted ? parsePriceString(highlighted.price) : 0,
    gradingFee: GRADER_FEES[graderName] || 25,
  }
}

function AuthenticityPanel({ auth }) {
  const [expanded, setExpanded] = useState(false)

  const verdictMeta = {
    'LIKELY GENUINE': { icon: '✅', cls: 'auth-genuine', bar: 'bar-genuine' },
    'INCONCLUSIVE':   { icon: '⚠️', cls: 'auth-warn',    bar: 'bar-warn'    },
    'LIKELY FAKE':    { icon: '🚨', cls: 'auth-fake',    bar: 'bar-fake'    },
  }
  const meta = verdictMeta[auth.verdict] || verdictMeta['INCONCLUSIVE']

  return (
    <div className={`auth-section ${meta.cls}`}>

      {/* HEADER ROW */}
      <div className="auth-header">
        <div className="auth-verdict-block">
          <span className="auth-icon">{meta.icon}</span>
          <div>
            <div className="auth-verdict-label">AUTHENTICITY CHECK</div>
            <div className="auth-verdict">{auth.verdict}</div>
          </div>
        </div>
        <div className="auth-confidence">
          <span className="auth-conf-label">AI Confidence</span>
          <span className="auth-conf-val">{auth.confidence}</span>
        </div>
      </div>

      {/* SUMMARY */}
      <div className="auth-summary">{auth.summary}</div>

      {/* SIGNALS */}
      {(auth.signals || []).length > 0 && (
        <div className="auth-signals">
          {auth.signals.map((s, i) => (
            <div key={i} className={`auth-signal ${s.type === 'genuine' ? 'signal-ok' : 'signal-warn'}`}>
              <span className="signal-icon">{s.type === 'genuine' ? '✓' : '!'}</span>
              <div>
                <div className="signal-label">{s.label}</div>
                <div className="signal-detail">{s.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RED FLAGS */}
      {(auth.redFlags || []).length > 0 && (
        <div className="auth-redflags">
          <div className="auth-redflags-title">🚩 Red Flags Detected</div>
          {auth.redFlags.map((f, i) => (
            <div key={i} className="auth-redflag-item">• {f}</div>
          ))}
        </div>
      )}

      {/* EXPANDABLE SECTION */}
      <button className="auth-expand-btn" onClick={() => setExpanded(e => !e)}>
        {expanded ? '▲ Hide' : '▼ Show'} how to verify this card yourself
      </button>

      {expanded && (
        <div className="auth-expanded">
          <div className="auth-checks-title">🔍 What to Check Physically</div>
          <div className="auth-checks">
            {(auth.whatToCheck || []).map((c, i) => (
              <div key={i} className="auth-check-item">
                <span className="auth-check-num">{i + 1}</span>
                <span>{c}</span>
              </div>
            ))}
          </div>

          <div className="auth-resources-title">📚 Learn More & Get Expert Help</div>
          <div className="auth-resources">
            {(auth.resources || []).map((r, i) => (
              <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="auth-resource-link">
                <span className="auth-resource-arrow">↗</span>
                {r.label}
              </a>
            ))}
          </div>

          <div className="auth-disclaimer">
            ⚠ AI authenticity checks are a starting point only — not a guarantee. For high-value cards,
            always submit to a professional grading service (PSA, BGS, CGC) for official authentication.
          </div>
        </div>
      )}

    </div>
  )
}

function FlipCalculator({ results }) {
  const [rawCost,     setRawCost]     = useState('')
  const [grader,      setGrader]      = useState('PSA')
  const [gradingFee,  setGradingFee]  = useState(25)
  const [shipping,    setShipping]    = useState(8)
  const [sellPrice,   setSellPrice]   = useState('')
  const [platform,    setPlatform]    = useState('eBay')
  const [calcResult,  setCalcResult]  = useState(null)

  // Auto-populate when AI results arrive or grader changes
  useEffect(() => {
    if (!results) return
    const auto = buildCalcFromResults(results, grader)
    if (!auto) return
    setSellPrice(auto.sellPrice > 0 ? String(auto.sellPrice) : '')
    setGradingFee(auto.gradingFee)
  }, [results, grader])

  // Recalculate whenever any input changes
  useEffect(() => {
    const raw    = parseFloat(rawCost)  || 0
    const sell   = parseFloat(sellPrice) || 0
    const fee    = parseFloat(gradingFee) || 0
    const ship   = parseFloat(shipping)  || 0
    const platFee = PLATFORM_FEES[platform] || 0

    if (raw === 0 && sell === 0) { setCalcResult(null); return }

    const platformCut = sell * platFee
    const totalCost   = raw + fee + ship
    const netProfit   = sell - totalCost - platformCut
    const roi         = totalCost > 0 ? (netProfit / totalCost) * 100 : 0
    const breakEven   = totalCost / (1 - platFee)

    setCalcResult({ totalCost, platformCut, netProfit, roi, breakEven })
  }, [rawCost, gradingFee, shipping, sellPrice, platform])

  function handleGraderChange(g) {
    setGrader(g)
    setGradingFee(GRADER_FEES[g] || 25)
  }

  const profit = calcResult?.netProfit ?? 0
  const isPos  = profit >= 0

  return (
    <div className="calc-section">
      <div className="calc-header">
        <div className="calc-title-block">
          <div className="calc-eyebrow">FLIP CALCULATOR</div>
          <h2 className="calc-title">Is This Worth Grading?</h2>
        </div>
        {results && (
          <div className="calc-autofill-badge">✦ Auto-filled from AI results</div>
        )}
      </div>

      <div className="calc-layout">

        {/* INPUTS */}
        <div className="calc-inputs">

          <div className="calc-field">
            <label className="calc-label">Raw Card Cost</label>
            <div className="calc-input-wrap">
              <span className="calc-prefix">$</span>
              <input
                type="number"
                className="calc-input"
                placeholder="0.00"
                value={rawCost}
                onChange={e => setRawCost(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="calc-field">
            <label className="calc-label">Grading Company</label>
            <div className="calc-grader-grid">
              {Object.keys(GRADER_FEES).map(g => (
                <button
                  key={g}
                  className={['calc-grader-btn', grader === g ? 'active' : ''].filter(Boolean).join(' ')}
                  onClick={() => handleGraderChange(g)}
                >
                  <span className="cgb-name">{g}</span>
                  <span className="cgb-fee">${GRADER_FEES[g]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="calc-row-2">
            <div className="calc-field">
              <label className="calc-label">Grading Fee</label>
              <div className="calc-input-wrap">
                <span className="calc-prefix">$</span>
                <input
                  type="number"
                  className="calc-input"
                  value={gradingFee}
                  onChange={e => setGradingFee(e.target.value)}
                  min="0"
                />
              </div>
            </div>
            <div className="calc-field">
              <label className="calc-label">Shipping (both ways)</label>
              <div className="calc-input-wrap">
                <span className="calc-prefix">$</span>
                <input
                  type="number"
                  className="calc-input"
                  value={shipping}
                  onChange={e => setShipping(e.target.value)}
                  min="0"
                  step="0.5"
                />
              </div>
            </div>
          </div>

          <div className="calc-field">
            <label className="calc-label">Expected Sell Price (graded)</label>
            <div className="calc-input-wrap">
              <span className="calc-prefix">$</span>
              <input
                type="number"
                className="calc-input"
                placeholder="0.00"
                value={sellPrice}
                onChange={e => setSellPrice(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="calc-field">
            <label className="calc-label">Sell Platform</label>
            <div className="calc-platform-grid">
              {Object.keys(PLATFORM_FEES).map(p => (
                <button
                  key={p}
                  className={['calc-platform-btn', platform === p ? 'active' : ''].filter(Boolean).join(' ')}
                  onClick={() => setPlatform(p)}
                >
                  <span>{p}</span>
                  <span className="cpb-fee">{(PLATFORM_FEES[p] * 100).toFixed(1)}%</span>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* RESULTS */}
        <div className="calc-results">

          {!calcResult ? (
            <div className="calc-empty">
              <div className="calc-empty-icon">🧮</div>
              <div className="calc-empty-text">Enter your costs to see profit breakdown</div>
            </div>
          ) : (
            <>
              {/* BIG NET PROFIT */}
              <div className={['calc-net', isPos ? 'pos' : 'neg'].join(' ')}>
                <div className="calc-net-label">NET PROFIT</div>
                <div className="calc-net-val">
                  {isPos ? '+' : ''}{profit < 0 ? '-' : ''}${Math.abs(profit).toFixed(2)}
                </div>
                <div className="calc-net-roi">
                  {isPos ? '▲' : '▼'} {Math.abs(calcResult.roi).toFixed(1)}% ROI
                </div>
              </div>

              {/* BREAKDOWN */}
              <div className="calc-breakdown">
                <div className="cb-row">
                  <span className="cb-label">Raw card cost</span>
                  <span className="cb-val neg-val">−${(parseFloat(rawCost) || 0).toFixed(2)}</span>
                </div>
                <div className="cb-row">
                  <span className="cb-label">Grading fee ({grader})</span>
                  <span className="cb-val neg-val">−${(parseFloat(gradingFee) || 0).toFixed(2)}</span>
                </div>
                <div className="cb-row">
                  <span className="cb-label">Shipping est.</span>
                  <span className="cb-val neg-val">−${(parseFloat(shipping) || 0).toFixed(2)}</span>
                </div>
                <div className="cb-divider" />
                <div className="cb-row">
                  <span className="cb-label">Total cost in</span>
                  <span className="cb-val">${calcResult.totalCost.toFixed(2)}</span>
                </div>
                <div className="cb-row">
                  <span className="cb-label">Sell price</span>
                  <span className="cb-val pos-val">+${(parseFloat(sellPrice) || 0).toFixed(2)}</span>
                </div>
                <div className="cb-row">
                  <span className="cb-label">{platform} fee ({(PLATFORM_FEES[platform] * 100).toFixed(1)}%)</span>
                  <span className="cb-val neg-val">−${calcResult.platformCut.toFixed(2)}</span>
                </div>
                <div className="cb-divider" />
                <div className="cb-row cb-total">
                  <span className="cb-label">Break-even sell price</span>
                  <span className="cb-val">${calcResult.breakEven.toFixed(2)}</span>
                </div>
              </div>

              {/* VERDICT */}
              <div className={['calc-verdict', isPos ? 'verdict-go' : 'verdict-skip'].join(' ')}>
                {isPos
                  ? `✅ Worth grading — ${Math.abs(calcResult.roi).toFixed(0)}% return after all fees`
                  : `🚫 Not worth it — you'd lose $${Math.abs(profit).toFixed(2)} on this flip`
                }
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  )
}

function SlabCalc() {
  const [frontPreview, setFrontPreview] = useState(null)
  const [backPreview,  setBackPreview]  = useState(null)
  const [frontImage,   setFrontImage]   = useState(null)
  const [backImage,    setBackImage]    = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [loadingStep,  setLoadingStep]  = useState(0)
  const [error,        setError]        = useState(null)
  const [results,      setResults]      = useState(null)
  const [frontDrag,    setFrontDrag]    = useState(false)
  const [backDrag,     setBackDrag]     = useState(false)

  const frontInputRef = useRef()
  const backInputRef  = useRef()
  const resultsRef    = useRef()

  async function handleFile(file, side) {
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    const b64 = await fileToBase64(file)
    if (side === 'front') { setFrontPreview(url); setFrontImage(b64) }
    else                  { setBackPreview(url);  setBackImage(b64) }
  }

  const onFileChange = (e, side) => handleFile(e.target.files[0], side)

  const onDrop = useCallback((e, side) => {
    e.preventDefault()
    if (side === 'front') setFrontDrag(false)
    else setBackDrag(false)
    handleFile(e.dataTransfer.files[0], side)
  }, [])

  async function analyzeCard() {
    if (!frontImage) return
    setLoading(true)
    setError(null)
    setResults(null)
    setLoadingStep(0)

    const interval = setInterval(() => {
      setLoadingStep(s => (s + 1) % LOADING_STEPS.length)
    }, 1800)

    try {
      const res = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frontImage, backImage }),
      })
      clearInterval(interval)

      // Guard: if response isn't JSON (e.g. Vercel size limit error), surface a clear message
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        const text = await res.text()
        throw new Error(`Server error (${res.status}): ${text.slice(0, 120)}`)
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'API error')
      setResults(data)
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch (err) {
      clearInterval(interval)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setFrontPreview(null); setBackPreview(null)
    setFrontImage(null);   setBackImage(null)
    setResults(null);      setError(null)
    setLoading(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="app">

      {/* HEADER */}
      <header>
        <div className="logo">
          <div className="logo-word">SlabCalc</div>
          <div className="logo-tag">AI Card Grader</div>
        </div>
        <div className="ai-badge">
          <div className="ai-dot" />
          Powered by Claude Vision
        </div>
      </header>

      <div className="page">

        {/* HERO */}
        <div className="hero">
          <div className="hero-eyebrow">Instant AI Grade Estimation</div>
          <h1>KNOW YOUR<span>CARD&apos;S VALUE</span></h1>
          <p>
            Upload front and back photos. Our AI analyzes condition, estimates grades
            across PSA, BGS, CGC, and ACE, and calculates your exact flip profit.
          </p>
        </div>

        {/* UPLOAD */}
        <div style={{ marginBottom: 48 }}>
          <div className="upload-grid">
            <div
              className={['upload-zone', frontPreview ? 'has-image' : '', frontDrag ? 'drag-over' : ''].filter(Boolean).join(' ')}
              onDragOver={e => { e.preventDefault(); setFrontDrag(true) }}
              onDragLeave={() => setFrontDrag(false)}
              onDrop={e => onDrop(e, 'front')}
              onClick={() => frontInputRef.current?.click()}
            >
              <input ref={frontInputRef} type="file" accept="image/*" onChange={e => onFileChange(e, 'front')} style={{ display: 'none' }} />
              {frontPreview
                ? <img src={frontPreview} className="preview-img" alt="Card front" />
                : <div className="upload-placeholder">
                    <div className="upload-icon">🃏</div>
                    <div className="upload-label">Card Front</div>
                    <div className="upload-sub">Click or drag to upload</div>
                  </div>
              }
              <div className="upload-side-label">FRONT</div>
            </div>

            <div
              className={['upload-zone', backPreview ? 'has-image' : '', backDrag ? 'drag-over' : ''].filter(Boolean).join(' ')}
              onDragOver={e => { e.preventDefault(); setBackDrag(true) }}
              onDragLeave={() => setBackDrag(false)}
              onDrop={e => onDrop(e, 'back')}
              onClick={() => backInputRef.current?.click()}
            >
              <input ref={backInputRef} type="file" accept="image/*" onChange={e => onFileChange(e, 'back')} style={{ display: 'none' }} />
              {backPreview
                ? <img src={backPreview} className="preview-img" alt="Card back" />
                : <div className="upload-placeholder">
                    <div className="upload-icon">🔄</div>
                    <div className="upload-label">Card Back</div>
                    <div className="upload-sub">Optional — improves accuracy</div>
                  </div>
              }
              <div className="upload-side-label">BACK</div>
            </div>
          </div>

          <button
            className={['analyze-btn', loading ? 'loading' : ''].filter(Boolean).join(' ')}
            disabled={!frontImage || loading}
            onClick={analyzeCard}
          >
            {loading && <div className="shimmer" />}
            {loading ? 'ANALYZING...' : frontImage ? '✦ ANALYZE CARD WITH AI' : '⬆ UPLOAD FRONT PHOTO TO BEGIN'}
          </button>

          {error && <div className="error-box">⚠ {error}</div>}
        </div>

        {/* LOADING */}
        {loading && (
          <div className="loading-wrap">
            <div className="loading-spinner" />
            <div className="loading-step">{LOADING_STEPS[loadingStep][0]}</div>
            <div className="loading-sub">{LOADING_STEPS[loadingStep][1]}</div>
          </div>
        )}

        {/* RESULTS */}
        {results && !loading && (
          <div className="results-wrap" ref={resultsRef}>

            <div className="results-header">
              <div className="card-identity">
                <h2>{results.cardName}</h2>
                <div className="set-line">
                  {[results.setName, results.cardNumber, results.rarity].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="condition-summary">
                <div className="cond-stat">
                  <div className="cond-stat-label">Centering</div>
                  <div className="cond-stat-val" style={{ color: 'var(--gold)' }}>{results.centering}</div>
                </div>
                <div className="cond-stat">
                  <div className="cond-stat-label">Corners</div>
                  <div className="cond-stat-val" style={{ color: 'var(--green)' }}>{results.corners}</div>
                </div>
                <div className="cond-stat">
                  <div className="cond-stat-label">Edges</div>
                  <div className="cond-stat-val" style={{ color: 'var(--blue)' }}>{results.edges}</div>
                </div>
                <div className="cond-stat">
                  <div className="cond-stat-label">Surface</div>
                  <div className="cond-stat-val" style={{ color: 'var(--orange)' }}>{results.surface}</div>
                </div>
              </div>
            </div>

            <div className="ai-notes">
              <div className="ai-notes-label">✦ AI Analysis</div>
              {results.aiNotes}
            </div>

            <div className="grading-grid">
              {(results.graders || []).map(grader => (
                <div key={grader.name} className="grade-card">
                  <div className="grade-card-header">
                    <div className="grader-name">{grader.name}</div>
                    <div className="grader-fee">{grader.fee}</div>
                  </div>
                  <div className="grade-card-body">
                    <div className={`estimated-grade ${gradeColorClass(grader.estimatedGrade)}`}>
                      {grader.estimatedGrade}
                    </div>
                    <div className="grade-confidence">{grader.confidence} confidence</div>
                    <div className="price-tiers">
                      {(grader.prices || []).map(p => (
                        <div key={p.grade} className="price-tier">
                          <span className="tier-grade">{p.grade}</span>
                          <span className={['tier-price', p.highlighted ? 'tier-highlighted' : ''].filter(Boolean).join(' ')}>
                            {p.price}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="roi-bar">
                      <div className="roi-label">
                        <span>Est. ROI</span>
                        <span className={grader.roiPositive ? 'roi-val-pos' : 'roi-val-neg'}>{grader.roiLabel}</span>
                      </div>
                      <div className="roi-track">
                        <div
                          className={grader.roiPositive ? 'roi-fill-pos' : 'roi-fill-neg'}
                          style={{ width: `${Math.min(Math.abs(grader.roiPercent || 0), 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="best-bet">
              <div className="best-bet-icon">🏆</div>
              <div className="best-bet-text">
                <h3>Best Pick: {results.bestGrader}</h3>
                <p>{results.bestGraderReason}</p>
              </div>
            </div>

            {/* AUTHENTICITY */}
            {results.authenticity && (
              <AuthenticityPanel auth={results.authenticity} />
            )}

          </div>
        )}

        {/* FLIP CALCULATOR — always visible, auto-populates after AI scan */}
        <FlipCalculator results={results} />

        {results && !loading && (
          <div style={{ textAlign: 'center', marginTop: 32, paddingBottom: 48 }}>
            <button className="reset-btn" onClick={reset}>← Analyze Another Card</button>
          </div>
        )}

      </div>
    </div>
  )
}

export default dynamic(() => Promise.resolve(SlabCalc), { ssr: false })
