(function (root, factory) {
  const builtIn = typeof module === "object" && module.exports
    ? require("./methods/builtin.js")
    : root.PsyBuiltInMethods;
  const api = factory(builtIn);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PsyMethods = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (builtIn) {
  "use strict";

  if (!builtIn?.methods || !builtIn?.byId) throw new Error("Встроенный каталог методик не загружен");

  const methods = [...builtIn.methods];
  const byId = Object.fromEntries(methods.map(method => [method.id, method]));
  const metricGuidance = {...builtIn.metricGuidance};
  const packages = new Map();
  const builtInIds = new Set(methods.map(method => method.id));
  const allowedTypes = new Set(["sum", "mean", "plusminus", "binary_plusminus", "directreverse", "signedreverse", "passport", "unavailable"]);
  const directionTypes = new Set(["positive", "negative", "context", "validity"]);
  const clean = value => String(value ?? "").trim().toLowerCase().replace(/ё/g, "е");
  const isObject = value => value && typeof value === "object" && !Array.isArray(value);
  const itemList = value => Array.isArray(value) && value.every(n => Number.isInteger(n));

  function fail(path, message) {
    const error = new Error(`${path}: ${message}`);
    error.code = "INVALID_METHOD_PACKAGE";
    throw error;
  }

  function validateItems(list, items, path) {
    if (!itemList(list) || !list.length) fail(path, "ожидается непустой массив целых номеров вопросов");
    const unique = new Set(list);
    if (unique.size !== list.length) fail(path, "номера вопросов не должны повторяться");
    const invalid = list.find(n => n < 1 || n > items);
    if (invalid != null) fail(path, `номер ${invalid} выходит за диапазон 1–${items}`);
  }

  function validateRanges(ranges, path) {
    if (!Array.isArray(ranges) || !ranges.length) fail(path, "ожидается непустая таблица диапазонов");
    ranges.forEach((row, index) => {
      if (!Array.isArray(row) || row.length !== 3) fail(`${path}[${index}]`, "ожидается [нижняя граница, верхняя граница, значение]");
      const [low, high, label] = row;
      if (low != null && !Number.isFinite(Number(low))) fail(`${path}[${index}][0]`, "граница должна быть числом или null");
      if (high != null && !Number.isFinite(Number(high))) fail(`${path}[${index}][1]`, "граница должна быть числом или null");
      if (label == null || label === "") fail(`${path}[${index}][2]`, "значение диапазона не задано");
    });
  }

  function validateDirection(direction, path) {
    if (!isObject(direction)) fail(path, "ожидается объект направления");
    if (!directionTypes.has(direction.type)) fail(`${path}.type`, "допустимы positive, negative, context, validity");
    if (!String(direction.label ?? "").trim()) fail(`${path}.label`, "подпись обязательна");
    if (!String(direction.note ?? "").trim()) fail(`${path}.note`, "пояснение обязательно");
  }

  function validateOptionalItems(list, items, path) {
    if (list == null) return;
    if (!itemList(list)) fail(path, "ожидается массив целых номеров вопросов");
    if (!list.length) return;
    validateItems(list, items, path);
  }

  function validatePassportScale(scale, items, path) {
    if (!isObject(scale)) fail(path, "ожидается объект декларативной шкалы");
    const fields = ["items", "direct", "reverse", "positive", "negative"];
    for (const field of fields) validateOptionalItems(scale[field], items, `${path}.${field}`);
    const used = fields.flatMap(field => scale[field] || []);
    if (!used.length) fail(path, "шкала не содержит пунктов");
    const withinScale = new Set();
    for (const item of used) {
      if (withinScale.has(item)) fail(path, `пункт ${item} повторно включен в одну шкалу`);
      withinScale.add(item);
    }
    if (!["sum", "mean", "difference_affine"].includes(scale.aggregate)) fail(`${path}.aggregate`, "допустимы sum, mean или difference_affine");
    if (scale.aggregate === "difference_affine" && (!Number.isFinite(Number(scale.offset)) || !Number.isFinite(Number(scale.divisor)) || Number(scale.divisor) === 0)) fail(path, "для difference_affine нужны числовые offset и ненулевой divisor");
  }

  function validateMethod(input, path, packageIds) {
    if (!isObject(input)) fail(path, "ожидается объект методики");
    const id = String(input.id ?? "").trim();
    if (!/^[a-z][a-z0-9_]{2,63}$/.test(id)) fail(`${path}.id`, "используйте 3–64 латинских символа, цифры и подчеркивания");
    if (builtInIds.has(id) || byId[id] || packageIds.has(id)) fail(`${path}.id`, `идентификатор ${id} уже используется`);
    packageIds.add(id);
    if (!String(input.name ?? "").trim()) fail(`${path}.name`, "название обязательно");
    if (!Number.isInteger(input.items) || input.items < 1 || input.items > 500) fail(`${path}.items`, "число вопросов должно быть целым от 1 до 500");
    if (!Array.isArray(input.aliases) || !input.aliases.length || input.aliases.some(alias => !String(alias).trim())) fail(`${path}.aliases`, "нужен непустой массив вариантов названия");
    if (!allowedTypes.has(input.type)) fail(`${path}.type`, `тип ${input.type || "не задан"} не поддерживается импортом`);
    if (!isObject(input.scales) || (input.type !== "unavailable" && !Object.keys(input.scales).length)) fail(`${path}.scales`, "нужна хотя бы одна шкала");
    if (!String(input.source ?? "").trim()) fail(`${path}.source`, "источник ключа обязателен");
    if (!["draft", "verified", "tested"].includes(input.status)) fail(`${path}.status`, "допустимы draft, verified, tested");
    if (input.quality_status != null && !["A_READY", "B_READY_WITH_LIMITATIONS", "C_NEEDS_VERIFICATION"].includes(input.quality_status)) fail(`${path}.quality_status`, "неизвестный статус готовности");
    if (input.quality_status === "C_NEEDS_VERIFICATION" && input.scoring_ready !== false) fail(`${path}.scoring_ready`, "для C_NEEDS_VERIFICATION расчет должен быть запрещен");
    if (["A_READY", "B_READY_WITH_LIMITATIONS"].includes(input.quality_status) && input.scoring_ready !== true) fail(`${path}.scoring_ready`, "для готового ключа расчет должен быть разрешен");
    if (input.valid != null && (!Array.isArray(input.valid) || !input.valid.length || input.valid.some(v => !Number.isFinite(Number(v))))) fail(`${path}.valid`, "ожидается непустой массив допустимых числовых ответов");
    if(input.responsePrefixMap!=null){
      if(!isObject(input.responsePrefixMap)||!Object.keys(input.responsePrefixMap).length)fail(`${path}.responsePrefixMap`,"ожидается непустое соответствие буквенных префиксов числовым баллам");
      for(const [prefix,value] of Object.entries(input.responsePrefixMap)){
        if(!String(prefix).trim()||!Number.isFinite(Number(value)))fail(`${path}.responsePrefixMap.${prefix}`,"балл должен быть числом");
        if(input.valid&&!input.valid.includes(Number(value)))fail(`${path}.responsePrefixMap.${prefix}`,"балл отсутствует в valid");
      }
    }
    if(input.responseMap!=null){
      if(!isObject(input.responseMap)||!Object.keys(input.responseMap).length)fail(`${path}.responseMap`,"ожидается непустое соответствие текстовых ответов числовым баллам");
      for(const [answer,value] of Object.entries(input.responseMap)){
        if(!String(answer).trim()||!Number.isFinite(Number(value)))fail(`${path}.responseMap.${answer}`,"балл должен быть числом");
        if(input.valid&&!input.valid.includes(Number(value)))fail(`${path}.responseMap.${answer}`,"балл отсутствует в valid");
      }
    }
    if (input.type === "directreverse" && !Number.isFinite(Number(input.reverseMax))) fail(`${path}.reverseMax`, "для обратных пунктов нужно указать reverseMax");

    for (const [name, scale] of Object.entries(input.scales)) {
      const scalePath = `${path}.scales.${name}`;
      if (!String(name).trim()) fail(scalePath, "название шкалы обязательно");
      if (["sum", "mean"].includes(input.type)) validateItems(scale, input.items, scalePath);
      if (input.type === "plusminus") {
        if (!isObject(scale)) fail(scalePath, "ожидаются массивы plus и minus");
        validateItems(scale.plus, input.items, `${scalePath}.plus`);
        validateItems(scale.minus, input.items, `${scalePath}.minus`);
      }
      if (input.type === "binary_plusminus") {
        if (!isObject(scale)) fail(scalePath, "ожидаются массивы plus и minus");
        if (!itemList(scale.plus || []) || !itemList(scale.minus || []) || !(scale.plus?.length || scale.minus?.length)) fail(scalePath, "нужен хотя бы один ключ plus или minus");
        if (scale.plus?.length) validateItems(scale.plus, input.items, `${scalePath}.plus`);
        if (scale.minus?.length) validateItems(scale.minus, input.items, `${scalePath}.minus`);
      }
      if (["directreverse", "signedreverse"].includes(input.type)) {
        if (!isObject(scale)) fail(scalePath, "ожидаются массивы direct и reverse");
        if (!itemList(scale.direct || []) || !itemList(scale.reverse || []) || !(scale.direct?.length || scale.reverse?.length)) fail(scalePath, "нужен хотя бы один ключ direct или reverse");
        if (scale.direct?.length) validateItems(scale.direct, input.items, `${scalePath}.direct`);
        if (scale.reverse?.length) validateItems(scale.reverse, input.items, `${scalePath}.reverse`);
      }
      if (input.type === "passport") validatePassportScale(scale, input.items, scalePath);
    }
    if (input.type === "passport") {
      const usedByScale = new Map();
      for (const [name, scale] of Object.entries(input.scales)) for (const item of ["items", "direct", "reverse", "positive", "negative"].flatMap(field => scale[field] || [])) {
        if (!usedByScale.has(item)) usedByScale.set(item, []);
        usedByScale.get(item).push(name);
      }
      const missingItems = Array.from({length: input.items}, (_, index) => index + 1).filter(item => !usedByScale.has(item));
      if (missingItems.length) fail(`${path}.scales`, `ключ не покрывает пункты: ${missingItems.join(", ")}`);
      const sharedItems = [...usedByScale].filter(([, names]) => new Set(names).size > 1);
      if (sharedItems.length && input.allowSharedItems !== true) fail(`${path}.scales`, `пункты повторно включены между шкалами: ${sharedItems.map(([item]) => item).join(", ")}`);
      const validMin = Math.min(...input.valid.map(Number)), validMax = Math.max(...input.valid.map(Number));
      if (Object.values(input.scales).some(scale => scale.reverse?.length) && Number(input.reverseMax) !== validMin + validMax) fail(`${path}.reverseMax`, `для шкалы ${validMin}–${validMax} ожидается ${validMin + validMax}`);
      if (input.inputTransform?.op === "reverse" && Number(input.inputTransform.max) !== validMin + validMax) fail(`${path}.inputTransform.max`, `для шкалы ${validMin}–${validMax} ожидается ${validMin + validMax}`);
      const known = new Set(Object.keys(input.scales));
      for (const [name, definition] of Object.entries(input.derived || {})) {
        if (!["sum", "mean", "abs_difference", "ratio_to_mean"].includes(definition.op)) fail(`${path}.derived.${name}.op`, "неподдерживаемая производная операция");
        const references = [...(definition.inputs || []), ...(definition.denominatorInputs || []), ...(definition.numerator ? [definition.numerator] : [])];
        const unknown = references.filter(reference => !known.has(reference));
        if (unknown.length) fail(`${path}.derived.${name}`, `неизвестные исходные показатели: ${unknown.join(", ")}`);
        if(definition.factor!=null&&!Number.isFinite(Number(definition.factor)))fail(`${path}.derived.${name}.factor`,"коэффициент должен быть числом");
        known.add(name);
      }
      for (const name of known) if (!Array.isArray(input.ranges?.[name]) || input.ranges[name].length !== 2 || input.ranges[name].some(value => !Number.isFinite(Number(value)))) fail(`${path}.ranges.${name}`, "для каждой шкалы и производного показателя нужен диапазон [min, max]");
    }
    if (input.forms != null) {
      if (!Array.isArray(input.forms) || !input.forms.length) fail(`${path}.forms`, "нужна хотя бы одна входная форма");
      for (let index = 0; index < input.forms.length; index++) {
        const form = input.forms[index];
        if (!isObject(form) || !String(form.id ?? "").trim()) fail(`${path}.forms[${index}]`, "идентификатор формы обязателен");
        if (!/^[0-9a-f]{8}$/i.test(String(form.headerFingerprint ?? ""))) fail(`${path}.forms[${index}].headerFingerprint`, "ожидается контрольная сигнатура из 8 hex-символов");
      }
    }
    if (input.levels != null) for (const [name, ranges] of Object.entries(input.levels)) validateRanges(ranges, `${path}.levels.${name}`);
    if (input.sten != null) for (const [name, ranges] of Object.entries(input.sten)) validateRanges(ranges, `${path}.sten.${name}`);
    if (!isObject(input.analytics) || !isObject(input.analytics.metrics) || (input.type !== "unavailable" && !Object.keys(input.analytics.metrics).length)) fail(`${path}.analytics.metrics`, "нужно явно описать показатели краткой и глубокой аналитики");
    let includedMetrics = 0;
    for (const [metric, rule] of Object.entries(input.analytics.metrics)) {
      const rulePath = `${path}.analytics.metrics.${metric}`;
      if (!String(metric).trim() || !isObject(rule)) fail(rulePath, "ожидается объект правила показателя");
      if (typeof rule.include !== "boolean") fail(`${rulePath}.include`, "укажите true или false");
      if (!String(rule.name ?? "").trim()) fail(`${rulePath}.name`, "каноническое название обязательно");
      if (!["brief", "deep"].includes(rule.tier)) fail(`${rulePath}.tier`, "допустимы brief или deep");
      if (rule.include) includedMetrics++;
    }
    if (!includedMetrics && input.type !== "unavailable") fail(`${path}.analytics.metrics`, "хотя бы один показатель должен быть включен в аналитику");
    if (!isObject(input.guidance)) fail(`${path}.guidance`, "нужно задать code, summary и default");
    if (!String(input.guidance.code ?? "").trim()) fail(`${path}.guidance.code`, "краткий код обязателен");
    if (!String(input.guidance.summary ?? "").trim()) fail(`${path}.guidance.summary`, "описание набора шкал обязательно");
    validateDirection(input.guidance.default, `${path}.guidance.default`);
    if (input.guidance.scales != null) for (const [name, direction] of Object.entries(input.guidance.scales)) validateDirection(direction, `${path}.guidance.scales.${name}`);

    return JSON.parse(JSON.stringify(input));
  }

  function validatePackage(input) {
    if (!isObject(input)) fail("package", "ожидается JSON-объект");
    if (input.schemaVersion !== 1) fail("schemaVersion", "поддерживается версия схемы 1");
    if (!isObject(input.package)) fail("package", "сведения о пакете не заданы");
    const packageId = String(input.package.id ?? "").trim();
    if (!/^[a-z][a-z0-9_-]{2,63}$/.test(packageId)) fail("package.id", "используйте 3–64 латинских символа, цифры, дефис или подчеркивание");
    if (!String(input.package.name ?? "").trim()) fail("package.name", "название пакета обязательно");
    if (!String(input.package.version ?? "").trim()) fail("package.version", "версия пакета обязательна");
    if (!Array.isArray(input.methods) || !input.methods.length) fail("methods", "пакет не содержит методик");
    const packageIds = new Set();
    const normalized = input.methods.map((method, index) => validateMethod(method, `methods[${index}]`, packageIds));
    return {
      schemaVersion: 1,
      package: {
        id: packageId,
        name: String(input.package.name).trim(),
        version: String(input.package.version).trim(),
        createdAt: String(input.package.createdAt ?? "").trim() || new Date().toISOString().slice(0, 10)
      },
      methods: normalized
    };
  }

  function directionFor(method, metric) {
    const exact = method.guidance?.scales?.[metric] || Object.entries(method.guidance?.scales || {}).find(([name]) => String(metric).startsWith(name))?.[1];
    return exact || method.guidance?.default || {type: "context", label: "требуется интерпретация", note: "Направление показателя не задано в паспорте."};
  }

  function registerPackage(input) {
    const normalized = validatePackage(input);
    if (packages.has(normalized.package.id)) fail("package.id", `пакет ${normalized.package.id} уже установлен`);
    for (const method of normalized.methods) {
      const installed = {...method, external: true, packageId: normalized.package.id};
      methods.push(installed);
      byId[installed.id] = installed;
      metricGuidance[installed.id] = installed.guidance;
    }
    packages.set(normalized.package.id, normalized);
    return packageInfo(normalized.package.id);
  }

  function removePackage(packageId) {
    const current = packages.get(packageId);
    if (!current) return false;
    const ids = new Set(current.methods.map(method => method.id));
    for (let index = methods.length - 1; index >= 0; index--) if (ids.has(methods[index].id)) methods.splice(index, 1);
    for (const id of ids) {
      delete byId[id];
      delete metricGuidance[id];
    }
    packages.delete(packageId);
    return true;
  }

  function replacePackage(input) {
    const packageId = String(input?.package?.id ?? "").trim();
    const previous = packages.get(packageId);
    if (!previous) return registerPackage(input);
    removePackage(packageId);
    try {
      return registerPackage(input);
    } catch (error) {
      registerPackage(previous);
      throw error;
    }
  }

  function packageInfo(packageId) {
    const value = packages.get(packageId);
    return value ? {
      id: value.package.id,
      name: value.package.name,
      version: value.package.version,
      createdAt: value.package.createdAt,
      methodIds: value.methods.map(method => method.id),
      methodNames: value.methods.map(method => method.name),
      statuses: value.methods.map(method => method.status)
    } : null;
  }

  function listPackages() {
    return [...packages.keys()].map(packageInfo);
  }

  function resolveMethod(ref) {
    if (!ref) return null;
    if (typeof ref === "object" && ref.id) return byId[ref.id] || ref;
    const value = clean(ref);
    return byId[ref] || methods.find(method => clean(method.name) === value) || methods.find(method => method.aliases?.some(alias => value.includes(clean(alias)))) || null;
  }

  function guidanceFor(methodRef, metric = "") {
    const method = resolveMethod(methodRef);
    if (!method) return {type: "context", label: "требуется интерпретация", note: "Направление показателя не задано в паспорте."};
    return method.external ? directionFor(method, metric) : builtIn.guidanceFor(method, metric);
  }

  function methodProfile(methodRef) {
    const method = resolveMethod(methodRef);
    if (!method) return null;
    if (!method.external) return builtIn.methodProfile(method);
    return {
      id: method.id,
      name: method.name,
      items: method.items,
      code: method.guidance.code,
      summary: method.guidance.summary,
      scaleNames: Object.keys(method.scales),
      source: method.source,
      status: method.status,
      packageId: method.packageId
    };
  }

  return {
    methods,
    byId,
    metricGuidance,
    resolveMethod,
    guidanceFor,
    methodProfile,
    validatePackage,
    registerPackage,
    replacePackage,
    removePackage,
    listPackages,
    builtInCount: builtIn.methods.length
  };
});
