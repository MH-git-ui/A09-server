// BetterAuth's official MongoDB adapter uses logical models. Keep their records
// in the users collection, with mandatory model filters on every operation.
// Public user queries never include credential, session or verification records.
export function scopedUsers(collection, model = "users") {
  const scope = model === "users"
    ? { __authModel: { $exists: false } }
    : { __authModel: model };
  const filter = (query = {}) => ({ $and: [scope, query] });
  const queryMethods = new Set([
    "find", "findOne", "countDocuments", "updateOne", "updateMany",
    "findOneAndUpdate", "deleteOne", "deleteMany", "findOneAndDelete",
  ]);
  return new Proxy(collection, {
    get(target, prop) {
      if (queryMethods.has(prop)) return (query, ...args) => target[prop](filter(query), ...args);
      if (prop === "aggregate") return (pipeline, ...args) => {
        if (pipeline.some(stage => stage.$lookup || stage.$unionWith))
          throw new Error("Authentication model joins are disabled.");
        return target.aggregate([{ $match: scope }, ...pipeline], ...args);
      };
      if (prop === "insertOne") return (document, ...args) => {
        if (model === "users" && "__authModel" in document)
          throw new Error("User payload cannot select an authentication model.");
        return target.insertOne(model === "users" ? document : { ...document, __authModel: model }, ...args);
      };
      if (prop === "createIndex") return (keys, options = {}) => {
        // Partial indexes keep optional auth fields from colliding with users.
        const partial = model === "users" ? { email: { $type: "string" } } : scope;
        return target.createIndex(keys, { ...options,
          name: `${model}_${Object.entries(keys).map(([key, direction]) => `${key}_${direction}`).join("_")}_${options.unique ? "unique" : "index"}`,
          partialFilterExpression: options.partialFilterExpression
            ? { $and: [partial, options.partialFilterExpression] } : partial,
        });
      };
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function applicationDatabase(rawDb) {
  return new Proxy(rawDb, {
    get(target, prop) {
      if (prop === "collection") return (name, ...args) => name === "users"
        ? scopedUsers(target.collection(name, ...args)) : target.collection(name, ...args);
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function authenticationDatabase(rawDb) {
  return new Proxy(rawDb, {
    get(target, prop) {
      if (prop === "collection") return (model) => {
        if (!["users", "account", "session", "verification"].includes(model))
          throw new Error(`Unsupported authentication model: ${model}`);
        return scopedUsers(target.collection("users"), model);
      };
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
