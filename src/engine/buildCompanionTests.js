/**
 * Companion clinical tests derived from an audiogram case (Tym / ART / DPOAE).
 * Shared by student MVP and instructor case generator.
 */

const FREQ_STR_TO_HZ = {
  '0.125kHz': 125,
  '0.25kHz': 250,
  '0.5kHz': 500,
  '1kHz': 1000,
  '2kHz': 2000,
  '4kHz': 4000,
  '8kHz': 8000,
};

/** Same LCG as generateAudiogram (deterministic 0..1). */
export function makeCompanionRng(seed) {
  let s = (seed >>> 0) || 123456789;
  return function rand() {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * OME teaching policy:
 * - severity ≤ 1（なし/軽度）→ Tym C、ART 減弱、DPOAE は AC 条件付き
 * - severity ≥ 2（中等度/重度）→ Tym B、ART 消失、DPOAE 全周波数 refer
 */
export function isMildOmeSeverity(meta = {}) {
  const sev = Number(meta?.severity);
  if (!Number.isFinite(sev)) return false; // 不明時は中等度扱い（教材の既定）
  return sev < 2;
}

function resolveOmeMildForEar(meta, earKey) {
  if (earKey === 'right' && meta?.rightIsMild != null) return !!meta.rightIsMild;
  if (earKey === 'left' && meta?.leftIsMild != null) return !!meta.leftIsMild;
  return isMildOmeSeverity(meta);
}

/** Prefer explicit per-ear type on tympanogram; fall back to pressure/compliance heuristics. */
function resolveTympanogramEarType(tym, earKey) {
  const explicit = earKey === 'right' ? tym?.rightType : tym?.leftType;
  if (explicit === 'A' || explicit === 'As' || explicit === 'Ad' || explicit === 'B' || explicit === 'C') {
    return explicit;
  }
  const peakCompliance = tym?.[earKey]?.peakCompliance;
  const peak = tym?.[earKey]?.peakPressure || 0;
  if (peakCompliance !== undefined && peakCompliance < 0.5) return 'B';
  if (peak > 50) return 'B';
  if (peak < -150) return 'B';
  if (peak <= -100 && peakCompliance !== undefined && peakCompliance >= 0.8) return 'C';
  if (peakCompliance !== undefined && peakCompliance >= 0.5 && peakCompliance < 0.8) return 'As';
  if (peakCompliance !== undefined && peakCompliance > 1.7) return 'Ad';
  if (tym?.type === 'B' || tym?.type === 'C' || tym?.type === 'As' || tym?.type === 'Ad') return tym.type;
  return 'A';
}

/** Convert engine {right,left} rows → presetTargets used by ART/DPOAE builders. */
export function engineCaseToTargets(caseData) {
  const targets = [];
  const pushEar = (rows, ear) => {
    (rows || []).forEach((r) => {
      const f = FREQ_STR_TO_HZ[r.freq];
      if (f == null) return;
      if (typeof r.ac === 'number') {
        targets.push({
          ear,
          transducer: 'AC',
          masked: false,
          freq: f,
          dB: r.ac,
          ...(r.soAC ? { so: true } : {}),
        });
      }
      if (typeof r.bc === 'number' && f >= 250 && f <= 4000) {
        targets.push({
          ear,
          transducer: 'BC',
          masked: true,
          freq: f,
          dB: r.bc,
          ...(r.soBC ? { so: true } : {}),
        });
      }
    });
  };
  pushEar(caseData?.right, 'R');
  pushEar(caseData?.left, 'L');
  return targets;
}

export function buildSimpleTympanogramFromProfile(profileName, meta = {}, rand = Math.random) {
  const resolvedProfile = profileName || 'Normal';
  const rightEarProfile = meta.rightProfile || resolvedProfile;
  const leftEarProfile = meta.leftProfile || resolvedProfile;

  const createEarConfig = (earProfile, earKey = 'right') => {
    if (!earProfile || earProfile === 'Normal' || earProfile.startsWith('SNHL_')) {
      return { config: { peakPressure: 0, peakCompliance: 1.1, sigma: 60 }, type: 'A' };
    }
    if (earProfile === 'CHL_Otosclerosis') {
      return { config: { peakPressure: 0, peakCompliance: 0.5, sigma: 60 }, type: 'As' };
    }
    if (earProfile === 'CHL_OssicularDiscontinuity') {
      const compliance = Number((rand() * 1 + 3).toFixed(1)); // 3.0 - 4.0 mL
      return { config: { peakPressure: 0, peakCompliance: compliance, sigma: 30 }, type: 'Ad' }; // sigmaを小さくしてより尖らせる
    }
    if (earProfile === 'CHL_AOM') {
      // 急性中耳炎：ピークは +50〜+200 daPa
      const peak = 50 + Math.round(rand() * 150);
      return { config: { peakPressure: peak, peakCompliance: 0.3, sigma: 80 }, type: 'B' };
    }
    if (earProfile === 'CHL_OME') {
      // severity≤1 → C（軽度陰圧）、severity≥2 → B（平坦型）
      // ※ peakPressure=0 + 低コンプライアンスは As に見えるため、B は -200 daPa 側へ寄せる
      if (resolveOmeMildForEar(meta, earKey)) {
        return { config: { peakPressure: -150, peakCompliance: 1.0, sigma: 60 }, type: 'C' };
      }
      return { config: { peakPressure: -200, peakCompliance: 0.2, sigma: 80 }, type: 'B' };
    }
    return { config: { peakPressure: 0, peakCompliance: 1.1, sigma: 60 }, type: 'A' };
  };

  let rightResult = createEarConfig(rightEarProfile, 'right');
  let leftResult = createEarConfig(leftEarProfile, 'left');

  if (resolvedProfile === 'CHL_OssicularDiscontinuity' && !meta.rightProfile && !meta.leftProfile && meta.affectedSide) {
    if (meta.affectedSide === 'R') {
      rightResult = createEarConfig('CHL_OssicularDiscontinuity', 'right');
      leftResult = createEarConfig('Normal', 'left');
    } else if (meta.affectedSide === 'L') {
      rightResult = createEarConfig('Normal', 'right');
      leftResult = createEarConfig('CHL_OssicularDiscontinuity', 'left');
    }
  }

  let right = rightResult.config;
  let left = leftResult.config;

  // 左右をわずかにずらす（型が変わらない範囲に限定）
  if (right.peakCompliance === left.peakCompliance && right.peakPressure === left.peakPressure) {
    if (leftResult.type === 'C') {
      left = {
        ...left,
        peakPressure: Math.max(-150, left.peakPressure - 12), // Cのまま（<-150でB再推定されない）
        peakCompliance: Number(Math.max(0.8, left.peakCompliance * 1.05).toFixed(2)),
      };
    } else if (leftResult.type === 'B') {
      left = {
        ...left,
        // B型はピーク位置をずらさず、平坦さをわずかに左右差だけつける
        peakCompliance: Number(Math.max(0.1, Math.min(0.25, left.peakCompliance * 0.85)).toFixed(2)),
      };
    } else {
      left = {
        ...left,
        peakPressure: left.peakPressure - 12,
        peakCompliance: Number(Math.max(0.2, left.peakCompliance * 1.05).toFixed(2)),
      };
    }
  }

  const clampAdCompliance = (earConfig, earType) => {
    if (earType !== 'Ad' || !earConfig || typeof earConfig.peakCompliance !== 'number') {
      return earConfig;
    }
    const capped = Math.min(earConfig.peakCompliance, 4.0);
    if (capped === earConfig.peakCompliance) {
      return earConfig;
    }
    return {
      ...earConfig,
      peakCompliance: Number(capped.toFixed(2)),
    };
  };

  right = clampAdCompliance(right, rightResult.type);
  left = clampAdCompliance(left, leftResult.type);

  const overallType = rightResult.type === leftResult.type
    ? rightResult.type
    : (rightResult.type !== 'A' ? rightResult.type : leftResult.type);

  return {
    type: overallType,
    right,
    left,
    rightType: rightResult.type,
    leftType: leftResult.type,
  };
}

export function buildArtConfig(presetTargets, tympanogram, disorderName = null, casePattern = null, meta = {}) {
  const ART_NORMAL_THRESHOLDS = {
    500: { ipsi: 80, cont: 85 },
    1000: { ipsi: 75, cont: 80 },
    2000: { ipsi: 80, cont: 85 }
  };

  const acThresholds = { right: {}, left: {} };
  const bcThresholds = { right: {}, left: {} };
  
  // プリセットからAC/BC値を抽出（ART用の周波数: 500, 1000, 2000Hz）
  presetTargets.forEach(target => {
    if ([500, 1000, 2000].includes(target.freq)) {
      const earKey = target.ear === 'R' ? 'right' : 'left';
      if (target.transducer === 'AC') {
        acThresholds[earKey][target.freq] = target.so ? 110 : target.dB;
      } else if (target.transducer === 'BC') {
        bcThresholds[earKey][target.freq] = target.so ? 110 : target.dB;
      }
    }
  });
  
  // ティンパノグラム型とpeakPressureを取得（明示タイプ優先）
  const getTympanogramType = (ear, tymp) => resolveTympanogramEarType(tymp, ear);
  
  // 耳硬化症の場合はART消失（As型でも反射消失）
  const isOtosclerosis = disorderName === '耳硬化症';
  
  const rightType = getTympanogramType('right', tympanogram);
  const leftType = getTympanogramType('left', tympanogram);
  
  // 耳硬化症の場合、または伝音性難聴でAs型の場合は反射消失を示すため、B型として扱う
  // （StapedialReflexGifコンポーネントはB型で反射消失を判定するため）
  const getEffectiveType = (type, ear) => {
    if (isOtosclerosis && type === 'As') {
      return 'B'; // 耳硬化症のAs型は反射消失のため、B型として扱う
    }
    // 伝音性難聴でAs型の場合も反射消失（耳硬化症以外でも可能性あり）
    if (casePattern === 'conductive' && type === 'As') {
      return 'B'; // As型で伝音性難聴は反射消失
    }
    return type;
  };
  
  const artConfig = {
    right: {
      acThresholds: acThresholds.right,
      bcThresholds: bcThresholds.right,
      tympanogramType: getEffectiveType(rightType, 'right'),
      peakPressure: tympanogram?.right?.peakPressure || 0
    },
    left: {
      acThresholds: acThresholds.left,
      bcThresholds: bcThresholds.left,
      tympanogramType: getEffectiveType(leftType, 'left'),
      peakPressure: tympanogram?.left?.peakPressure || 0
    }
  };

  const profiles = {
    right: meta?.rightProfile || meta?.profile || null,
    left: meta?.leftProfile || meta?.profile || null
  };
  const isOssicular = disorderName === 'CHL_OssicularDiscontinuity'
    || disorderName === '耳小骨離断'
    || profiles.right === 'CHL_OssicularDiscontinuity'
    || profiles.left === 'CHL_OssicularDiscontinuity';

  // AOM症例の判定（片側AOM、片側正常の場合）
  const isAOM = disorderName === 'AOM' 
    || disorderName === '急性中耳炎'
    || profiles.right === 'CHL_AOM'
    || profiles.left === 'CHL_AOM';
  
  // OME症例の判定
  const isOME = disorderName === 'OME'
    || disorderName === '滲出性中耳炎'
    || profiles.right === 'CHL_OME'
    || profiles.left === 'CHL_OME';
  
  // OMEの軽度/中程度判定（明示フラグ → severity → Tym型）
  const rightIsMildOME = meta?.rightIsMild != null
    ? !!meta.rightIsMild
    : (isOME ? (isMildOmeSeverity(meta) || rightType === 'C') : false);
  const leftIsMildOME = meta?.leftIsMild != null
    ? !!meta.leftIsMild
    : (isOME ? (isMildOmeSeverity(meta) || leftType === 'C') : false);
  
  // デバッグログ
  if (disorderName === 'AOM' || disorderName === '急性中耳炎' || profiles.right === 'CHL_AOM' || profiles.left === 'CHL_AOM') {
    console.log('buildArtConfig: isAOM判定', {
      disorderName,
      profiles,
      isAOM,
      rightType,
      leftType
    });
  }

  if (isOssicular) {
    let affectedSide = meta?.affectedSide || null;
    if (!affectedSide) {
      if (profiles.right === 'CHL_OssicularDiscontinuity' && profiles.left !== 'CHL_OssicularDiscontinuity') {
        affectedSide = 'R';
      } else if (profiles.left === 'CHL_OssicularDiscontinuity' && profiles.right !== 'CHL_OssicularDiscontinuity') {
        affectedSide = 'L';
      }
    }

    const freqs = [500, 1000, 2000];
    const elevation = 15;

    const ensureOverride = (earKey, key) => {
      if (!artConfig[earKey][key]) artConfig[earKey][key] = {};
      return artConfig[earKey][key];
    };

    const markAbsent = (earKey) => {
      freqs.forEach(freq => {
        ensureOverride(earKey, 'ipsilateralOverride')[freq] = 999;
        ensureOverride(earKey, 'contralateralOverride')[freq] = 999;
      });
    };

    const elevateContralateral = (earKey) => {
      freqs.forEach(freq => {
        const contBase = ART_NORMAL_THRESHOLDS[freq]?.cont ?? 85;
        const ipsiBase = ART_NORMAL_THRESHOLDS[freq]?.ipsi ?? 80;
        ensureOverride(earKey, 'contralateralOverride')[freq] = contBase + elevation;
        ensureOverride(earKey, 'ipsilateralOverride')[freq] = ipsiBase;
      });
    };

    if (affectedSide === 'R') {
      markAbsent('right');
      elevateContralateral('left');
    } else if (affectedSide === 'L') {
      markAbsent('left');
      elevateContralateral('right');
    } else {
      // 影響側が不明な場合は両側を安全側にする
      markAbsent('right');
      markAbsent('left');
    }
  } else if (isAOM) {
    // AOM症例の場合：AOM側（B型）の耳でのみ反射消失、正常側（A型）の耳では反射保持
    const freqs = [500, 1000, 2000];
    const elevation = 15; // CONT反射の閾値上昇量

    const ensureOverride = (earKey, key) => {
      if (!artConfig[earKey][key]) artConfig[earKey][key] = {};
      return artConfig[earKey][key];
    };

    // AOM側（B型）の耳：IPSI/CONTともに反射消失
    const markAbsent = (earKey) => {
      freqs.forEach(freq => {
        ensureOverride(earKey, 'ipsilateralOverride')[freq] = 999;
        ensureOverride(earKey, 'contralateralOverride')[freq] = 999;
      });
    };

    // 正常側（A型）の耳：IPSI反射あり、CONT反射は閾値上昇するも反応あり
    const elevateContralateral = (earKey) => {
      freqs.forEach(freq => {
        const base = ART_NORMAL_THRESHOLDS[freq]?.cont ?? 85;
        // CONT反射は閾値上昇するが、反応あり（999ではなく上昇した閾値を設定）
        ensureOverride(earKey, 'contralateralOverride')[freq] = base + elevation;
        // IPSI反射は正常閾値を明示的に設定（overrideで確実に正常反射を保証）
        const ipsiBase = ART_NORMAL_THRESHOLDS[freq]?.ipsi ?? 80;
        ensureOverride(earKey, 'ipsilateralOverride')[freq] = ipsiBase;
      });
    };

    // 左右どちらがAOM側かを判定
    const rightIsAOM = rightType === 'B' || profiles.right === 'CHL_AOM';
    const leftIsAOM = leftType === 'B' || profiles.left === 'CHL_AOM';

    if (rightIsAOM && !leftIsAOM) {
      // Rt AOM, Lt normal
      markAbsent('right');
      elevateContralateral('left');
    } else if (leftIsAOM && !rightIsAOM) {
      // Rt normal, Lt AOM
      markAbsent('left');
      elevateContralateral('right');
    } else if (rightIsAOM && leftIsAOM) {
      // 両側AOM
      markAbsent('right');
      markAbsent('left');
    }
    // 両側正常の場合は何もしない（正常反射）
  } else if (isOME) {
    // OME症例の場合：軽度/中程度に応じて処理を分岐
    const freqs = [500, 1000, 2000];
    const elevation = 15; // CONT反射の閾値上昇量

    const ensureOverride = (earKey, key) => {
      if (!artConfig[earKey][key]) artConfig[earKey][key] = {};
      return artConfig[earKey][key];
    };

    // 中程度以上（B型）の耳：IPSI/CONTともに反射消失
    const markAbsent = (earKey) => {
      freqs.forEach(freq => {
        ensureOverride(earKey, 'ipsilateralOverride')[freq] = 999;
        ensureOverride(earKey, 'contralateralOverride')[freq] = 999;
      });
    };

    // 軽度（C型）の耳：振幅減弱するもIPSI/CONT反射（+）
    // ART振幅減弱：閾値上昇（+15dB）するが反応あり
    const markAttenuated = (earKey) => {
      freqs.forEach(freq => {
        const ipsiBase = ART_NORMAL_THRESHOLDS[freq]?.ipsi ?? 80;
        const contBase = ART_NORMAL_THRESHOLDS[freq]?.cont ?? 85;
        // 振幅減弱：閾値上昇（+15dB）するが反応あり（999ではなく上昇した閾値を設定）
        ensureOverride(earKey, 'ipsilateralOverride')[freq] = ipsiBase + elevation;
        ensureOverride(earKey, 'contralateralOverride')[freq] = contBase + elevation;
      });
    };

    // 左右どちらが軽度/中程度かを判定
    const rightIsMild = rightIsMildOME || rightType === 'C';
    const leftIsMild = leftIsMildOME || leftType === 'C';

    if (rightIsMild && !leftIsMild) {
      // Rt 軽度（C型）, Lt 中程度以上（B型）
      markAttenuated('right');
      markAbsent('left');
    } else if (leftIsMild && !rightIsMild) {
      // Rt 中程度以上（B型）, Lt 軽度（C型）
      markAbsent('right');
      markAttenuated('left');
    } else if (!rightIsMild && !leftIsMild) {
      // 両側中程度以上（B型）
      markAbsent('right');
      markAbsent('left');
    } else {
      // 両側軽度（C型）：振幅減弱
      markAttenuated('right');
      markAttenuated('left');
    }
  }

  // 片側伝音障害（AOM/OME/耳小骨離断以外、または疾患判定漏れ時）のフォールバック
  const artFreqs = [500, 1000, 2000];
  const contElevation = 15;
  const ensureArtOverride = (earKey, key) => {
    if (!artConfig[earKey][key]) artConfig[earKey][key] = {};
    return artConfig[earKey][key];
  };
  const markAbsentEar = (earKey) => {
    artFreqs.forEach(freq => {
      ensureArtOverride(earKey, 'ipsilateralOverride')[freq] = 999;
      ensureArtOverride(earKey, 'contralateralOverride')[freq] = 999;
    });
  };
  const elevateNormalEar = (normalEarKey) => {
    artFreqs.forEach(freq => {
      const contBase = ART_NORMAL_THRESHOLDS[freq]?.cont ?? 85;
      const ipsiBase = ART_NORMAL_THRESHOLDS[freq]?.ipsi ?? 80;
      ensureArtOverride(normalEarKey, 'contralateralOverride')[freq] = contBase + contElevation;
      ensureArtOverride(normalEarKey, 'ipsilateralOverride')[freq] = ipsiBase;
    });
  };
  const earHasArtOverride = (earKey) => {
    const cfg = artConfig[earKey];
    return !!(cfg.ipsilateralOverride || cfg.contralateralOverride);
  };

  const rightIsConductive = artConfig.right.tympanogramType === 'B';
  const leftIsConductive = artConfig.left.tympanogramType === 'B';

  if (rightIsConductive && !leftIsConductive && !earHasArtOverride('right') && !earHasArtOverride('left')) {
    markAbsentEar('right');
    elevateNormalEar('left');
  } else if (leftIsConductive && !rightIsConductive && !earHasArtOverride('left') && !earHasArtOverride('right')) {
    markAbsentEar('left');
    elevateNormalEar('right');
  }

  return artConfig;
}

export function buildDPOAEConfig(presetTargets, tympanogram, meta = {}) {
  // DPOAEの周波数: [1, 2, 3, 4, 6, 8] kHz
  const dpoaeFrequencies = [1, 2, 3, 4, 6, 8];
  
  // オージオグラムのAC値を抽出（Hz単位で保存）
  const audiogramAC = { right: {}, left: {} };
  presetTargets.forEach(target => {
    if (target.transducer === 'AC') {
      const earKey = target.ear === 'R' ? 'right' : 'left';
      audiogramAC[earKey][target.freq] = target.so ? 110 : target.dB;
    }
  });
  
  // DPOAE周波数ごとにAC値を設定
  const acThresholds = { right: {}, left: {} };
  dpoaeFrequencies.forEach(dpoaeFreq => {
    ['right', 'left'].forEach(ear => {
      const earKey = ear;
      let acValue;
      
      if (dpoaeFreq === 1) {
        // DPOAE 1kHz → オージオグラム 1kHz
        acValue = audiogramAC[earKey][1000];
      } else if (dpoaeFreq === 2) {
        // DPOAE 2kHz → オージオグラム 2kHz
        acValue = audiogramAC[earKey][2000];
      } else if (dpoaeFreq === 3) {
        // DPOAE 3kHz → オージオグラム 2kHzと4kHzのAC平均
        const ac2k = audiogramAC[earKey][2000];
        const ac4k = audiogramAC[earKey][4000];
        if (ac2k !== undefined && ac4k !== undefined) {
          acValue = Math.round((ac2k + ac4k) / 2);
        } else if (ac4k !== undefined) {
          acValue = ac4k; // フォールバック：4kHzのみ
        } else if (ac2k !== undefined) {
          acValue = ac2k; // フォールバック：2kHzのみ
        }
      } else if (dpoaeFreq === 4) {
        // DPOAE 4kHz → オージオグラム 4kHz
        acValue = audiogramAC[earKey][4000];
      } else if (dpoaeFreq === 6) {
        // DPOAE 6kHz → オージオグラム 4kHzと8kHzのAC平均
        const ac4k = audiogramAC[earKey][4000];
        const ac8k = audiogramAC[earKey][8000];
        if (ac4k !== undefined && ac8k !== undefined) {
          acValue = Math.round((ac4k + ac8k) / 2);
        } else if (ac8k !== undefined) {
          acValue = ac8k; // フォールバック：8kHzのみ
        } else if (ac4k !== undefined) {
          acValue = ac4k; // フォールバック：4kHzのみ
        }
      } else if (dpoaeFreq === 8) {
        // DPOAE 8kHz → オージオグラム 8kHz
        acValue = audiogramAC[earKey][8000];
      }
      
      if (acValue !== undefined) {
        acThresholds[earKey][dpoaeFreq] = acValue;
      }
    });
  });
  
  // ティンパノグラム型を取得（明示タイプ優先。As/Ad は伝音として後段で扱う）
  const getTympanogramType = (ear, tymp) => {
    const t = resolveTympanogramEarType(tymp, ear);
    // DPOAEの伝音ブロック用に As/Ad も B 扱い
    if (t === 'As' || t === 'Ad') return 'B';
    return t;
  };
  
  const tympanogramType = {
    right: getTympanogramType('right', tympanogram),
    left: getTympanogramType('left', tympanogram)
  };
  
  // OMEの軽度/中程度：severity 連動（≥2 は非軽度 → B + 全 refer）
  const profileIsOME =
    meta?.profile === 'CHL_OME'
    || meta?.rightProfile === 'CHL_OME'
    || meta?.leftProfile === 'CHL_OME';
  const rightIsMildOME = meta?.rightIsMild != null
    ? !!meta.rightIsMild
    : (profileIsOME ? (isMildOmeSeverity(meta) && tympanogramType.right === 'C') : false);
  const leftIsMildOME = meta?.leftIsMild != null
    ? !!meta.leftIsMild
    : (profileIsOME ? (isMildOmeSeverity(meta) && tympanogramType.left === 'C') : false);

  // severity≥2 の OME は型を B に固定（再推定ズレ防止）
  if (profileIsOME && !isMildOmeSeverity(meta)) {
    if (meta?.rightProfile !== 'Normal' && (meta?.rightProfile === 'CHL_OME' || meta?.profile === 'CHL_OME' || !meta?.rightProfile)) {
      tympanogramType.right = 'B';
    }
    if (meta?.leftProfile !== 'Normal' && (meta?.leftProfile === 'CHL_OME' || meta?.profile === 'CHL_OME' || !meta?.leftProfile)) {
      tympanogramType.left = 'B';
    }
  }
  
  return {
    acThresholds,
    tympanogramType,
    rightIsMildOME,
    leftIsMildOME,
    frequencies: dpoaeFrequencies,
  };
}

export function generateDPOAEData(dpoaeConfig, caseId = '') {
  const frequencies = [1, 2, 3, 4, 6, 8];
  
  // ノイズフロアの基本値（周波数ごとの範囲の中間値）
  const noiseFloorBase = {
    1: 17,   // 12-22 の中央値
    2: 15,   // 10-20 の中央値
    3: 13,   // 8-18 の中央値
    4: 11.5, // 7-16 の中央値
    6: 10,   // 6-14 の中央値
    8: 10    // 6-14 の中央値
  };
  
  // デターミニスティックなノイズフロア（症例IDと周波数、耳に基づく固定変動）
  // 左右で異なるノイズフロア値を生成（より大きな幅を持つ）
  const getNoiseFloor = (freq, ear) => {
    const base = noiseFloorBase[freq];
    // 症例IDと周波数、耳に基づく固定変動パターン（左右で異なる変動を加える）
    // 右耳と左耳で異なるseedを使用して、左右で異なるノイズフロア値を生成
    const earMultiplier = ear === 'right' ? 1 : 5; // 左右で異なるパターンを作るための係数（より大きく）
    const seed = (caseId.charCodeAt(0) || 65) * 100 + freq * 10 + earMultiplier;
    // 左右で異なる変動パターン（右耳はsin系、左耳はcos系に偏らせる）
    // 変動幅を大きくする（±3-4dB程度）
    const sinVariation = Math.sin(seed * 0.1) * 3.5;
    const cosVariation = Math.cos(seed * 0.15) * 2.5;
    const variation = ear === 'right' 
      ? sinVariation + cosVariation * 0.6  // 右耳のパターン
      : cosVariation + sinVariation * 0.6; // 左耳のパターン（異なるパターン、より大きな差）
    const rangeMin = { 1: 12, 2: 10, 3: 8, 4: 7, 6: 6, 8: 6 }[freq];
    const rangeMax = { 1: 22, 2: 20, 3: 18, 4: 16, 6: 14, 8: 14 }[freq];
    return Math.max(rangeMin, Math.min(rangeMax, base + variation));
  };
  
  const generateEarData = (ear) => {
    const acThresholds = dpoaeConfig.acThresholds[ear];
    const tympanogramType = dpoaeConfig.tympanogramType[ear];
    
    return frequencies.map((freq, index) => {
      const acThreshold = acThresholds[freq];
      const noiseFloor = getNoiseFloor(freq, ear);
      
      // ルール判定（優先順位順）
      // 【最重要】伝音障害（B型）がある場合は、AC閾値に関係なく全周波数でREFERを最優先
      // 1. 伝音障害（ティンパノB型）→ 全周波数でSNR < 2dB（REFER）
      // 2. OME軽度（C型）でAC <= 20dB → SNR >= 6dB（正常/PASS）
      // 3. OME（C型またはB型）でAC > 20dB → SNR < 2dB（B型）またはSNR < 6dB（C型軽度）
      // 4. AC ≥ 35dB（感音性難聴など）→ SNR < 2dB
      // 5. それ以外 → 正常（SNR 6〜12dB、確実に6以上になるように）
      
      // OME軽度/中程度の判定
      const isMildOME = (ear === 'right' ? dpoaeConfig.rightIsMildOME : dpoaeConfig.leftIsMildOME) || false;
      const isOME = tympanogramType === 'C' || tympanogramType === 'B';
      
      let snr;
      // 【最優先】伝音障害（B型）がある場合は、AC閾値に関係なく全周波数でREFER
      if (tympanogramType === 'B') {
        // B型（伝音障害）→ 全周波数でSNR < 2dB（REFER）
        // AC閾値に関係なく、伝音障害がある場合は必ずREFER
        const seed = (caseId.charCodeAt(0) || 65) * 1000 + freq * 100 + index * 10 + (ear === 'right' ? 1 : 2);
        snr = 0.5 + (Math.sin(seed * 0.1) * 0.5 + Math.cos(seed * 0.2) * 0.3); // 0.5〜1.5dB程度の固定値
      } else if (isOME && !isMildOME) {
        // OME中等度以上（非mild）で型がCのまま残っても全周波数REFER（severity≥2ポリシー）
        const seed = (caseId.charCodeAt(0) || 65) * 1000 + freq * 100 + index * 10 + (ear === 'right' ? 1 : 2);
        snr = 0.5 + (Math.sin(seed * 0.1) * 0.5 + Math.cos(seed * 0.2) * 0.3);
      } else if (tympanogramType === 'C' && isMildOME && acThreshold !== undefined && acThreshold <= 20) {
        // OME軽度（C型）でAC <= 20dB → SNR >= 6dB（正常/PASS）
        // 確実に6dB以上になるように、最小値を6.5dBに設定
        const seed = (caseId.charCodeAt(0) || 65) * 1000 + freq * 100 + index * 10 + (ear === 'right' ? 1 : 2);
        // SNR 6.5〜12dBの範囲で生成（確実に6以上になるように）
        const baseSNR = 8; // 基本SNR 8dB
        const earOffset = ear === 'right' 
          ? Math.sin(seed * 0.05) * 2.5  // 右耳の変動幅を大きく
          : Math.cos(seed * 0.05) * 2.5; // 左耳の変動幅を大きく
        snr = Math.max(6.5, Math.min(12, baseSNR + earOffset)); // 最小値を6.5dBに設定して確実に6dB以上にする
      } else if (isOME && acThreshold !== undefined && acThreshold > 20) {
        // OME（C型またはB型）でAC > 20dB → REFER
        if (tympanogramType === 'C' && isMildOME) {
          // OME軽度（C型）でAC > 20dB → SNR < 6dB（6dB未満でREFER）
          const seed = (caseId.charCodeAt(0) || 65) * 1000 + freq * 100 + index * 10 + (ear === 'right' ? 1 : 2);
          snr = 2 + (Math.sin(seed * 0.1) * 2 + Math.cos(seed * 0.2) * 1.5); // 2〜5.5dB程度の固定値
          snr = Math.max(2, Math.min(5.5, snr)); // 6dB未満に制限（REFERになるように）
        } else {
          // OME中程度以上（B型）でAC > 20dB → SNR < 2dB（ただし、B型は既に上で処理済み）
          const seed = (caseId.charCodeAt(0) || 65) * 1000 + freq * 100 + index * 10 + (ear === 'right' ? 1 : 2);
          snr = 0.5 + (Math.sin(seed * 0.1) * 0.5 + Math.cos(seed * 0.2) * 0.3); // 0.5〜1.5dB程度の固定値
        }
      } else if (tympanogramType === 'C' && isMildOME) {
        // 軽度CでAC未設定などは安全側でREFER寄りにしないが、教材上は軽度でも不明なら条件付きpassを避ける
        // AC不明時は軽度Cでも参照不能として低SNR
        const seed = (caseId.charCodeAt(0) || 65) * 1000 + freq * 100 + index * 10 + (ear === 'right' ? 1 : 2);
        snr = 2 + (Math.sin(seed * 0.1) * 2 + Math.cos(seed * 0.2) * 1.5);
        snr = Math.max(2, Math.min(5.5, snr));
      } else if (acThreshold !== undefined && acThreshold >= 35) {
        // AC >= 35dB（感音性難聴など）→ SNR < 2dB
        const seed = (caseId.charCodeAt(0) || 65) * 1000 + freq * 100 + index * 10 + (ear === 'right' ? 1 : 2);
        snr = 0.5 + (Math.sin(seed * 0.1) * 0.5 + Math.cos(seed * 0.2) * 0.3); // 0.5〜1.5dB程度の固定値
      } else {
        // 正常: SNR 6〜12dB（固定値で右左に差、確実に6以上になるように）
        // 症例と周波数に基づく固定値
        const seed = (caseId.charCodeAt(0) || 65) * 1000 + freq * 100 + index * 10 + (ear === 'right' ? 1 : 2);
        // 右耳と左耳でより大きな差が出るように（±2-3dB程度）
        const baseSNR = 8; // 基本SNR 8dB
        // 左右で異なるオフセット（右耳はsin系、左耳はcos系でより大きな差）
        const earOffset = ear === 'right' 
          ? Math.sin(seed * 0.05) * 2.5  // 右耳の変動幅を大きく
          : Math.cos(seed * 0.05) * 2.5; // 左耳の変動幅を大きく
        // SNRが確実に6以上になるように（最小値6dB、最大値12dB程度）
        snr = Math.max(6, Math.min(12, baseSNR + earOffset));
      }
      
      const dpoaeLevel = noiseFloor + snr;
      
      return Math.max(0, Math.min(30, dpoaeLevel)); // 0〜30dBの範囲にクランプ
    });
  };
  
  // ノイズフロアデータも生成（SNR計算用）
  const noiseFloorData = {
    right: frequencies.map((freq) => getNoiseFloor(freq, 'right')),
    left: frequencies.map((freq) => getNoiseFloor(freq, 'left'))
  };
  
  return {
    right: generateEarData('right'),
    left: generateEarData('left'),
    noiseFloor: noiseFloorData
  };
}


function summarizeArtEar(earCfg) {
  if (!earCfg) return { ipsi: '—', cont: '—' };
  const freqs = [500, 1000, 2000];
  const fmt = (overrides) => {
    if (!overrides) return '正常帯';
    const vals = freqs.map((f) => overrides[f]).filter((v) => v != null);
    if (!vals.length) return '正常帯';
    if (vals.every((v) => v >= 999)) return '消失';
    if (vals.some((v) => v >= 999)) return '一部消失';
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return `閾値↑(~${Math.round(avg)}dB)`;
  };
  return {
    ipsi: fmt(earCfg.ipsilateralOverride),
    cont: fmt(earCfg.contralateralOverride),
  };
}

function inferEarType(tym, earKey) {
  const ear = tym?.[earKey];
  if (!ear) return '—';
  if (ear.peakCompliance != null && ear.peakCompliance >= 3) return 'Ad';
  if (ear.peakCompliance != null && ear.peakCompliance <= 0.35 && (ear.peakPressure || 0) >= 50) return 'B';
  if (ear.peakCompliance != null && ear.peakCompliance <= 0.5 && Math.abs(ear.peakPressure || 0) < 50) return 'As';
  if ((ear.peakPressure || 0) <= -100) return 'C';
  if ((ear.peakPressure || 0) >= 50 && ear.peakCompliance <= 0.4) return 'B';
  return tym.type || 'A';
}

function summarizeDpoaePresent(cfg, data, ear) {
  if (!data?.[ear]) return '—';
  const freqs = cfg?.frequencies || [1, 2, 3, 4, 6, 8];
  const noise = data.noiseFloor?.[ear] || freqs.map(() => 0);
  let present = 0;
  data[ear].forEach((lvl, i) => {
    const snr = lvl - (noise[i] ?? 0);
    if (snr >= 6) present += 1;
  });
  if (present === 0) return '全周波数 refer';
  if (present === freqs.length) return '全周波数 pass';
  return `${present}/${freqs.length} pass`;
}

/**
 * Build tym / ART / DPOAE from a generateAudiogram() result.
 */
export function buildCompanionBundle(caseData, opts = {}) {
  const includeTym = opts.includeTym !== false;
  const includeArt = opts.includeArt !== false;
  const includeDpoae = opts.includeDpoae !== false;
  const meta = { ...(caseData?.meta || {}) };
  const profileName =
    opts.disorderName || meta.profile || meta.rightProfile || meta.leftProfile || 'Normal';
  const casePattern = opts.casePattern ?? meta.casePattern ?? null;
  const seed = Number.isFinite(Number(meta.seed)) ? Number(meta.seed) : 123456789;
  const rand = makeCompanionRng(seed ^ 0x54d9a);

  // OME: severity から軽度フラグを補完（明示指定があれば尊重）
  if (profileName === 'CHL_OME' || meta.profile === 'CHL_OME') {
    const mild = isMildOmeSeverity(meta);
    if (meta.rightIsMild == null) meta.rightIsMild = mild;
    if (meta.leftIsMild == null) meta.leftIsMild = mild;
  }

  let tympanogram = null;
  if (includeTym || includeArt || includeDpoae) {
    tympanogram = buildSimpleTympanogramFromProfile(profileName, meta, rand);
  }

  const targets = engineCaseToTargets(caseData);
  let artConfig = null;
  if (includeArt && tympanogram) {
    artConfig = buildArtConfig(targets, tympanogram, profileName, casePattern, meta);
  }

  let dpoaeConfig = null;
  let dpoaeData = null;
  if (includeDpoae && tympanogram) {
    dpoaeConfig = buildDPOAEConfig(targets, tympanogram, meta);
    dpoaeData = generateDPOAEData(dpoaeConfig, `seed-${seed}`);
  }

  const summary = {
    tym: tympanogram
      ? {
          overall: tympanogram.type,
          rightType: tympanogram.rightType || inferEarType(tympanogram, 'right'),
          leftType: tympanogram.leftType || inferEarType(tympanogram, 'left'),
          right: tympanogram.right,
          left: tympanogram.left,
        }
      : null,
    art: artConfig
      ? {
          right: summarizeArtEar(artConfig.right),
          left: summarizeArtEar(artConfig.left),
          rightTym: artConfig.right?.tympanogramType,
          leftTym: artConfig.left?.tympanogramType,
        }
      : null,
    dpoae: dpoaeConfig
      ? {
          rightPresent: summarizeDpoaePresent(dpoaeConfig, dpoaeData, 'right'),
          leftPresent: summarizeDpoaePresent(dpoaeConfig, dpoaeData, 'left'),
        }
      : null,
  };

  return {
    tympanogram: includeTym ? tympanogram : null,
    artConfig: includeArt ? artConfig : null,
    dpoaeConfig: includeDpoae ? dpoaeConfig : null,
    dpoaeData: includeDpoae ? dpoaeData : null,
    targets,
    summary,
  };
}
