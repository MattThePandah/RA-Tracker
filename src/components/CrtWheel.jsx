import React, { useState, useEffect, useCallback, useRef } from 'react'
import UnifiedWheel from './UnifiedWheel.jsx'
import { buildOverlayUrl } from '../utils/overlayApi.js'

function useInterval(cb, ms) {
    useEffect(() => {
        const id = setInterval(cb, ms)
        return () => clearInterval(id)
    }, [cb, ms])
}

export default function CrtWheel({
    base = 'http://localhost:8787',
    onStateChange,
    pinned = false
}) {
    const [wheelState, setWheelState] = useState({
        mode: 'game',
        sample: [],
        spin: null,
        selectedConsole: 'All',
        event: { name: '', consoles: [] }
    })
    const lastSpinTs = useRef(0)
    const activeUntilRef = useRef(0)
    const spinInProgressRef = useRef(false)
    const holdUntilRef = useRef(0)
    const spinRef = useRef(null)
    const [visible, setVisible] = useState(false)
    const onStateChangeRef = useRef(onStateChange)
    const lastReportRef = useRef({})

    useEffect(() => {
        onStateChangeRef.current = onStateChange
    }, [onStateChange])

    useEffect(() => {
        spinRef.current = wheelState.spin || null
    }, [wheelState.spin])

    const report = useCallback((payload) => {
        const prev = lastReportRef.current || {}
        const next = payload || {}
        const same =
            prev.active === next.active &&
            prev.mode === next.mode &&
            prev.selectedConsole === next.selectedConsole &&
            prev.spinTs === next.spinTs &&
            prev.spinning === next.spinning

        if (same) return
        lastReportRef.current = next
        onStateChangeRef.current?.(payload)
    }, [])

    const fetchSpin = useCallback(async () => {
        try {
            if (!base) return
            // 1. Check for new Spin
            const res = await fetch(buildOverlayUrl('/overlay/spin', base))
            if (res.ok) {
                const spin = await res.json()
                // If timestamp is newer than last seen, update it
                if (spin.ts && spin.ts !== lastSpinTs.current) {
                    lastSpinTs.current = spin.ts
                    spinInProgressRef.current = true
                    holdUntilRef.current = 0
                    setWheelState(prev => ({ ...prev, spin }))
                    const durationMs = Number(spin.durationMs) || 4500
                    const winnerHold = 2500
                    const winnerFade = 450
                    activeUntilRef.current = Date.now() + durationMs + winnerHold + winnerFade + 1000
                    setVisible(prev => (prev ? prev : true))
                    report({ active: true, spinning: true, spin, spinTs: spin.ts })
                }
            }

            // 2. Poll for idle state (sample/mode updates from admin)
            const r2 = await fetch(buildOverlayUrl('/overlay/wheel-state', base))
            if (r2.ok) {
                const state = await r2.json()
                const now = Date.now()
                const isHolding = now < holdUntilRef.current
                const isSpinning = spinInProgressRef.current
                if (!(isSpinning || isHolding)) {
                    setWheelState(prev => {
                        // Only update if changed to avoid renders.
                        const nextMode = state.mode || 'game'
                        const nextSample = Array.isArray(state.sample) ? state.sample : []
                        const nextSelectedConsole = state.selectedConsole || 'All'
                        const nextEvent = state.event || { name: '', consoles: [] }

                        const changed =
                            prev.mode !== nextMode ||
                            prev.selectedConsole !== nextSelectedConsole ||
                            JSON.stringify(prev.sample) !== JSON.stringify(nextSample)

                        if (changed) {
                            return { ...prev, sample: nextSample, mode: nextMode, selectedConsole: nextSelectedConsole, event: nextEvent }
                        }
                        return prev
                    })
                }

                const shouldBeVisible = pinned || now < activeUntilRef.current || (state.mode === 'console')
                setVisible(prev => (prev === shouldBeVisible ? prev : shouldBeVisible))
                report({
                    active: shouldBeVisible,
                    spinning: spinInProgressRef.current,
                    mode: state.mode,
                    selectedConsole: state.selectedConsole,
                    event: state.event,
                    spinTs: lastSpinTs.current || 0
                })
            }
        } catch (e) {
            // console.error(e) // Silent fail on polling
        }
    }, [base, report, pinned])

    useInterval(fetchSpin, 1000)

    // Initial fetch
    useEffect(() => { fetchSpin() }, [fetchSpin])

    if (!(pinned || visible)) return null

    const handleSpinComplete = (winner) => {
        spinInProgressRef.current = false
        const winnerHold = 2500
        const winnerFade = 450
        holdUntilRef.current = Date.now() + winnerHold + winnerFade

        const spin = spinRef.current
        const spinTs = Number(spin?.ts) || lastSpinTs.current || 0
        report({
            active: true,
            spinning: false,
            spin,
            winner,
            mode: wheelState.mode,
            selectedConsole: wheelState.selectedConsole,
            event: wheelState.event,
            spinTs
        })
    }

    return (
        <div className="crt-wheel-container" style={{ width: '100%', height: '100%', position: 'relative' }}>
            <UnifiedWheel
                mode={wheelState.mode}
                sample={wheelState.sample}
                spinSeed={wheelState.spin}
                isOverlay={true}
                winnerHoldMs={2500}
                winnerFadeMs={450}
                showWinnerOverlay={false}
                onSpinComplete={handleSpinComplete}
            />
        </div>
    )
}
