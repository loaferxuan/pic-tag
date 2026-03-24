describe('默认标签 ID 规范化', () => {
  function normalizeTagIds(tagIds: number[]): number[] {
    const seen = new Set<number>();
    const normalized: number[] = [];
    for (const tagId of tagIds) {
      if (!Number.isInteger(tagId) || tagId <= 0 || seen.has(tagId)) continue;
      seen.add(tagId);
      normalized.push(tagId);
    }
    return normalized;
  }

  it('过滤掉负数', () => {
    const input = [1, -1, 2, -100];
    const result = normalizeTagIds(input);
    expect(result).toEqual([1, 2]);
  });

  it('过滤掉零', () => {
    const input = [0, 1, 0, 2];
    const result = normalizeTagIds(input);
    expect(result).toEqual([1, 2]);
  });

  it('过滤掉非整数', () => {
    const input = [1, 2.5, 3, -1.5];
    const result = normalizeTagIds(input);
    expect(result).toEqual([1, 3]);
  });

  it('去除重复', () => {
    const input = [1, 2, 1, 3, 2, 1];
    const result = normalizeTagIds(input);
    expect(result).toEqual([1, 2, 3]);
  });

  it('保留原始顺序', () => {
    const input = [3, 1, 4, 1, 5, 9, 2, 6];
    const result = normalizeTagIds(input);
    expect(result).toEqual([3, 1, 4, 5, 9, 2, 6]);
  });

  it('处理空数组', () => {
    const input: number[] = [];
    const result = normalizeTagIds(input);
    expect(result).toEqual([]);
  });

  it('处理全是非法值', () => {
    const input = [-1, 0, -100, NaN];
    const result = normalizeTagIds(input);
    expect(result).toEqual([]);
  });
});

describe('存储的标签 ID 解析', () => {
  function parseStoredTagIds(raw: string | null): number[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      const numbers: number[] = [];
      for (const item of parsed) {
        const candidate =
          typeof item === 'number'
            ? item
            : typeof item === 'string'
              ? Number(item)
              : NaN;
        if (Number.isInteger(candidate) && candidate > 0) {
          numbers.push(candidate);
        }
      }
      return normalizeTagIdsInternal(numbers);
    } catch {
      return [];
    }
  }

  function normalizeTagIdsInternal(tagIds: number[]): number[] {
    const seen = new Set<number>();
    const normalized: number[] = [];
    for (const tagId of tagIds) {
      if (!Number.isInteger(tagId) || tagId <= 0 || seen.has(tagId)) continue;
      seen.add(tagId);
      normalized.push(tagId);
    }
    return normalized;
  }

  it('解析有效的 JSON 数组', () => {
    const raw = '[1, 2, 3]';
    const result = parseStoredTagIds(raw);
    expect(result).toEqual([1, 2, 3]);
  });

  it('解析字符串数字', () => {
    const raw = '["1", "2", "3"]';
    const result = parseStoredTagIds(raw);
    expect(result).toEqual([1, 2, 3]);
  });

  it('解析混合类型数组', () => {
    const raw = '[1, "2", 3, "4"]';
    const result = parseStoredTagIds(raw);
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it('过滤非法值', () => {
    const raw = '[1, -1, "abc", null, 2, 0]';
    const result = parseStoredTagIds(raw);
    expect(result).toEqual([1, 2]);
  });

  it('处理 null', () => {
    const result = parseStoredTagIds(null);
    expect(result).toEqual([]);
  });

  it('处理空字符串', () => {
    const result = parseStoredTagIds('');
    expect(result).toEqual([]);
  });

  it('处理无效 JSON', () => {
    const result = parseStoredTagIds('not valid json');
    expect(result).toEqual([]);
  });

  it('处理非数组 JSON', () => {
    const result = parseStoredTagIds('{"key": "value"}');
    expect(result).toEqual([]);
  });

  it('处理 NaN 字符串', () => {
    const raw = '["NaN", 1, "abc"]';
    const result = parseStoredTagIds(raw);
    expect(result).toEqual([1]);
  });
});

describe('现有标签 ID 过滤', () => {
  function filterExistingTagIds(tagIds: number[], existingIds: number[]): number[] {
    const existingSet = new Set(existingIds);
    return tagIds.filter((id) => existingSet.has(id));
  }

  const existingIds = [1, 2, 3, 5, 8, 13];

  it('保留存在的 ID', () => {
    const input = [1, 2, 3];
    const result = filterExistingTagIds(input, existingIds);
    expect(result).toEqual([1, 2, 3]);
  });

  it('过滤不存在的 ID', () => {
    const input = [1, 4, 6, 8];
    const result = filterExistingTagIds(input, existingIds);
    expect(result).toEqual([1, 8]);
  });

  it('全部不存在时返回空数组', () => {
    const input = [100, 200, 300];
    const result = filterExistingTagIds(input, existingIds);
    expect(result).toEqual([]);
  });

  it('处理空输入', () => {
    const input: number[] = [];
    const result = filterExistingTagIds(input, existingIds);
    expect(result).toEqual([]);
  });

  it('处理空现有 ID', () => {
    const input = [1, 2, 3];
    const result = filterExistingTagIds(input, []);
    expect(result).toEqual([]);
  });
});

describe('默认标签数据校验', () => {
  it('标签 ID 应为正整数', () => {
    const validIds = [1, 2, 100, 999];
    validIds.forEach((id) => {
      expect(Number.isInteger(id) && id > 0).toBe(true);
    });
  });

  it('空标签列表是有效的', () => {
    const emptyIds: number[] = [];
    expect(Array.isArray(emptyIds)).toBe(true);
  });

  it('单个标签是有效的', () => {
    const singleId = [42];
    expect(singleId.length).toBe(1);
    expect(Number.isInteger(singleId[0]) && singleId[0]! > 0).toBe(true);
  });

  it('多个标签是有效的', () => {
    const multipleIds = [1, 2, 3, 4, 5];
    expect(multipleIds.length).toBe(5);
    multipleIds.forEach((id) => {
      expect(Number.isInteger(id) && id > 0).toBe(true);
    });
  });

  it('标签列表应无重复', () => {
    const ids = [1, 2, 3, 4, 5];
    const uniqueIds = [...new Set(ids)];
    expect(uniqueIds.length).toBe(ids.length);
  });
});

describe('默认标签与预设同步', () => {
  function getPresetTagIds(items: Array<{ tag_id: number | null }>): number[] {
    return items.filter((item) => item.tag_id !== null).map((item) => item.tag_id as number);
  }

  const mockPresetItems = [
    { tag_id: 101 },
    { tag_id: 102 },
    { tag_id: null },
    { tag_id: 103 },
  ];

  it('从预设项中提取 tagId', () => {
    const tagIds = getPresetTagIds(mockPresetItems);
    expect(tagIds).toEqual([101, 102, 103]);
  });

  it('过滤掉 null 值', () => {
    const tagIds = getPresetTagIds(mockPresetItems);
    expect(tagIds).not.toContain(null);
  });

  it('空预设项返回空数组', () => {
    const tagIds = getPresetTagIds([]);
    expect(tagIds).toEqual([]);
  });

  it('全部为 null 时返回空数组', () => {
    const items = [{ tag_id: null }, { tag_id: null }];
    const tagIds = getPresetTagIds(items);
    expect(tagIds).toEqual([]);
  });
});

describe('默认标签存储格式', () => {
  it('序列化为 JSON 数组', () => {
    const ids = [1, 2, 3];
    const stored = JSON.stringify(ids);
    expect(stored).toBe('[1,2,3]');
  });

  it('反序列化 JSON 数组', () => {
    const stored = '[1,2,3]';
    const parsed = JSON.parse(stored);
    expect(parsed).toEqual([1, 2, 3]);
  });

  it('空数组序列化为空 JSON 数组', () => {
    const ids: number[] = [];
    const stored = JSON.stringify(ids);
    expect(stored).toBe('[]');
  });

  it('反序列化空 JSON 数组', () => {
    const stored = '[]';
    const parsed = JSON.parse(stored);
    expect(parsed).toEqual([]);
  });
});

describe('数据一致性校验', () => {
  function sanitizeTagIds(stored: string | null, existingIds: number[]): { sanitized: number[]; needsUpdate: boolean } {
    if (!stored) return { sanitized: [], needsUpdate: true };

    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      return { sanitized: [], needsUpdate: true };
    }

    if (!Array.isArray(parsed)) return { sanitized: [], needsUpdate: true };

    const existingSet = new Set(existingIds);
    const rawIds: number[] = [];
    for (const item of parsed) {
      if (typeof item === 'number' && Number.isInteger(item) && item > 0) {
        rawIds.push(item);
      } else if (typeof item === 'string') {
        const num = Number(item);
        if (Number.isInteger(num) && num > 0) {
          rawIds.push(num);
        }
      }
    }

    const seen = new Set<number>();
    const sanitized: number[] = [];
    for (const id of rawIds) {
      if (!seen.has(id)) {
        seen.add(id);
        if (existingSet.has(id)) {
          sanitized.push(id);
        }
      }
    }

    const sanitizedText = JSON.stringify(sanitized);
    const needsUpdate = stored !== sanitizedText;

    return { sanitized, needsUpdate };
  }

  it('需要清理无效标签', () => {
    const stored = '[1,2,999]';
    const existingIds = [1, 2, 3];
    const result = sanitizeTagIds(stored, existingIds);
    expect(result.sanitized).toEqual([1, 2]);
    expect(result.needsUpdate).toBe(true);
  });

  it('无需更新有效数据', () => {
    const stored = '[1,2,3]';
    const existingIds = [1, 2, 3];
    const result = sanitizeTagIds(stored, existingIds);
    expect(result.sanitized).toEqual([1, 2, 3]);
    expect(result.needsUpdate).toBe(false);
  });

  it('处理空存储', () => {
    const result = sanitizeTagIds(null, [1, 2, 3]);
    expect(result.sanitized).toEqual([]);
    expect(result.needsUpdate).toBe(true);
  });

  it('处理损坏的 JSON', () => {
    const result = sanitizeTagIds('invalid json', [1, 2, 3]);
    expect(result.sanitized).toEqual([]);
    expect(result.needsUpdate).toBe(true);
  });

  it('处理全部无效的标签', () => {
    const stored = '[999,888,777]';
    const existingIds = [1, 2, 3];
    const result = sanitizeTagIds(stored, existingIds);
    expect(result.sanitized).toEqual([]);
    expect(result.needsUpdate).toBe(true);
  });
});

describe('边界条件测试', () => {
  it('处理极大数值', () => {
    const largeId = Number.MAX_SAFE_INTEGER;
    expect(Number.isInteger(largeId)).toBe(true);
    expect(largeId > 0).toBe(true);
  });

  it('处理零值字符串', () => {
    const parsed = Number('0');
    expect(Number.isInteger(parsed)).toBe(true);
    expect(parsed > 0).toBe(false);
  });

  it('处理负数字符串', () => {
    const parsed = Number('-1');
    expect(Number.isInteger(parsed)).toBe(true);
    expect(parsed > 0).toBe(false);
  });

  it('处理浮点数字符串', () => {
    const parsed = Number('1.5');
    expect(Number.isInteger(parsed)).toBe(false);
  });

  it('处理超长数组', () => {
    const longArray = Array.from({ length: 1000 }, (_, i) => i + 1);
    const uniqueArray = [...new Set(longArray)];
    expect(uniqueArray.length).toBe(1000);
  });
});
