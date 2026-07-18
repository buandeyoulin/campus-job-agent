(function installOfferBiuBridgeCore(root) {
  "use strict";

  const POSTING_FIELDS = Object.freeze([
    "id",
    "companyName",
    "companyNature",
    "industry",
    "recruitType",
    "targetYears",
    "locations",
    "positionsText",
    "deadlineText",
    "announcementUrl",
    "applyUrl",
    "examPolicy",
    "noteText",
    "sourceUpdatedAt",
    "seasonYear",
  ]);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function sanitizePosting(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const result = {};
    for (const key of POSTING_FIELDS) {
      if (!Object.hasOwn(value, key)) continue;
      const field = value[key];
      result[key] = Array.isArray(field) ? [...field] : field;
    }
    return result;
  }

  function validRecord(value) {
    const record = sanitizePosting(value);
    return Boolean(
      record
      && typeof record.id === "string"
      && record.id.trim()
      && typeof record.companyName === "string"
      && record.companyName.trim()
      && typeof record.positionsText === "string"
      && record.positionsText.trim(),
    );
  }

  function validateBatch(value) {
    return Boolean(
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && typeof value.syncId === "string"
      && UUID.test(value.syncId)
      && Number.isInteger(value.seasonYear)
      && value.seasonYear >= 2000
      && value.seasonYear <= 2100
      && Number.isInteger(value.page)
      && value.page >= 0
      && Number.isInteger(value.totalPages)
      && value.totalPages >= 1
      && value.totalPages <= 10_000
      && value.page < value.totalPages
      && Array.isArray(value.records)
      && value.records.length >= 1
      && value.records.length <= 50
      && value.records.every(validRecord),
    );
  }

  function pageNumbers(totalPages) {
    if (!Number.isInteger(totalPages) || totalPages < 1 || totalPages > 10_000) return [];
    return Array.from({ length: totalPages }, (_, page) => page);
  }

  root.OfferBiuBridgeCore = Object.freeze({
    POSTING_FIELDS,
    pageNumbers,
    sanitizePosting,
    validateBatch,
  });
})(globalThis);
