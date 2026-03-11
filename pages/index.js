import { useState, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'

const LOADING_STEPS = [
  ['SCANNING CARD...', 'Identifying card name, set, and edition'],
  ['ANALYZING CONDITION...', 'Evaluating centering, corners, edges, and surface'],
  ['ESTIMATING GRADES...', 'Calculating expected grade across PSA, BGS, CGC, ACE'],
  ['FETCHING PRICES...', 'Looking up current market values for each grade tier'],
]

function gradeColorClass(grade) {
  const g = parseFloat(grade)
  if (g >= 10) return 'grade-10'
  if (g >= 9)  return 'grade-9'
  if (g >= 8)  return 'grade-8'
  return 'grade-7'
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const data = result.split(',')[1]
      const mediaType = file.type || 'image/jpeg'
      resolve({ data, mediaType })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
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
    if (side === 'front') {
      setFrontPreview(url)
      setFrontImage(b64)
    } else {
      setBackPreview(url)
      setBackImage(b64)
    }
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
    setFrontPreview(null)
    setBackPreview(null)
    setFrontImage(null)
    setBackImage(null)
    setResults(null)
    setError(null)
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
          <h1>
            KNOW YOUR
            <span>CARD&apos;S VALUE</span>
          </h1>
          <p>
            Upload front and back photos. Our AI analyzes condition and estimates
            grades across PSA, BGS, CGC, and ACE — with current market prices for each.
          </p>
        </div>

        {/* UPLOAD */}
        <div style={{ marginBottom: 48 }}>
          <div className="upload-grid">

            {/* FRONT */}
            <div
              className={['upload-zone', frontPreview ? 'has-image' : '', frontDrag ? 'drag-over' : ''].filter(Boolean).join(' ')}
              onDragOver={e => { e.preventDefault(); setFrontDrag(true) }}
              onDragLeave={() => setFrontDrag(false)}
              onDrop={e => onDrop(e, 'front')}
              onClick={() => frontInputRef.current?.click()}
            >
              <input
                ref={frontInputRef}
                type="file"
                accept="image/*"
                onChange={e => onFileChange(e, 'front')}
                style={{ display: 'none' }}
              />
              {frontPreview ? (
                <img src={frontPreview} className="preview-img" alt="Card front" />
              ) : (
                <div className="upload-placeholder">
                  <div className="upload-icon">🃏</div>
                  <div className="upload-label">Card Front</div>
                  <div className="upload-sub">Click or drag to upload</div>
                </div>
              )}
              <div className="upload-side-label">FRONT</div>
            </div>

            {/* BACK */}
            <div
              className={['upload-zone', backPreview ? 'has-image' : '', backDrag ? 'drag-over' : ''].filter(Boolean).join(' ')}
              onDragOver={e => { e.preventDefault(); setBackDrag(true) }}
              onDragLeave={() => setBackDrag(false)}
              onDrop={e => onDrop(e, 'back')}
              onClick={() => backInputRef.current?.click()}
            >
              <input
                ref={backInputRef}
                type="file"
                accept="image/*"
                onChange={e => onFileChange(e, 'back')}
                style={{ display: 'none' }}
              />
              {backPreview ? (
                <img src={backPreview} className="preview-img" alt="Card back" />
              ) : (
                <div className="upload-placeholder">
                  <div className="upload-icon">🔄</div>
                  <div className="upload-label">Card Back</div>
                  <div className="upload-sub">Optional — improves accuracy</div>
                </div>
              )}
              <div className="upload-side-label">BACK</div>
            </div>

          </div>

          <button
            className={['analyze-btn', loading ? 'loading' : ''].filter(Boolean).join(' ')}
            disabled={!frontImage || loading}
            onClick={analyzeCard}
          >
            {loading && <div className="shimmer" />}
            {loading
              ? 'ANALYZING...'
              : frontImage
                ? '✦ ANALYZE CARD WITH AI'
                : '⬆ UPLOAD FRONT PHOTO TO BEGIN'}
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
                        <span className={grader.roiPositive ? 'roi-val-pos' : 'roi-val-neg'}>
                          {grader.roiLabel}
                        </span>
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

            <div style={{ textAlign: 'center' }}>
              <button className="reset-btn" onClick={reset}>← Analyze Another Card</button>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}

// ssr: false prevents server/client HTML mismatch — this page is
// entirely client-driven (FileReader, URL.createObjectURL, fetch).
export default dynamic(() => Promise.resolve(SlabCalc), { ssr: false })
