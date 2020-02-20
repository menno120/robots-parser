export interface IRule {
	pattern: string | RegExp;
	allow: boolean;
	lineNumber: number;
}

class Robots {
	private _rules: { [key: string]: { rules: IRule[]; crawlDelay: number } } = {};
	private _url: URL | null = null;
	private _sitemaps: string[] = [];
	private _preferredHost: string | null = null;

	constructor(url: string, contents: string) {
		this._url = this.parseUrl(url);

		this.parseRobots(contents || "");
	}

	/**
	 * Adds the specified allow/deny rule to the rules
	 * for the specified user-agents.
	 */
	addRule = (userAgents: string[], pattern: string, allow: boolean, lineNumber: number) => {
		var rules = this._rules;

		userAgents.forEach((userAgent) => {
			if (!Object.keys(rules).includes(userAgent)) {
				rules[userAgent] = { rules: [], crawlDelay: 0 };
			}

			if (!pattern) {
				return;
			}

			this._rules[userAgent].rules.push({
				pattern: this.parsePattern(pattern),
				allow: allow,
				lineNumber: lineNumber
			});
		});
	};

	/**
	 * Adds the specified delay to the specified user agents.
	 */
	setCrawlDelay = (userAgents: string[], delayStr: string) => {
		var rules = this._rules;
		var delay = parseInt(delayStr);

		userAgents.forEach((userAgent) => {
			if (!Object.keys(rules).includes(userAgent)) {
				rules[userAgent] = { rules: [], crawlDelay: 0 };
			}

			if (isNaN(delay)) {
				return;
			}

			this._rules[userAgent].crawlDelay = delay;
		});
	};

	/**
	 * Add a sitemap
	 */
	addSitemap = (url: string) => {
		this._sitemaps.push(url);
	};

	/**
	 * Sets the preferred host name
	 */
	setPreferredHost = (url: string) => {
		this._preferredHost = url;
	};

	private _getRule = (url: string, ua: string): IRule | null => {
		var parsedUrl = this.parseUrl(url);
		var userAgent = this.formatUserAgent(ua || "*");

		if (parsedUrl !== null) {
			parsedUrl.port = parsedUrl.port;

			if (this._url === null) {
				return null;
			}

			// The base URL must match otherwise this robots.txt is not valid for it.
			if (
				parsedUrl.protocol !== this._url.protocol ||
				parsedUrl.hostname !== this._url.hostname ||
				parsedUrl.port !== this._url.port
			) {
				return null;
			}

			var rules = this._rules[userAgent] || this._rules["*"] || [];
			var path = this.urlEncodeToUpper(parsedUrl.pathname + parsedUrl.search);
			// @ts-ignore
			var rule = this.findRule(path, rules.rules);

			return rule;
		} else {
			return null;
		}
	};

	/**
	 * Returns true if allowed, false if not allowed.
	 *
	 * Will return undefined if the URL is not valid for
	 * this robots.txt file.
	 */
	isAllowed = (url: string, ua: string) => {
		var rule = this._getRule(url, ua);

		if (typeof rule === "undefined") {
			return;
		}

		return !rule || rule.allow;
	};

	/**
	 * Returns the line number of the matching directive for the specified
	 * URL and user-agent if any.
	 *
	 * The line numbers start at 1 and go up (1-based indexing).
	 *
	 * Return -1 if there is no matching directive. If a rule is manually
	 * added without a lineNumber then this will return undefined for that
	 * rule.
	 */
	getMatchingLineNumber = (url: string, ua: string): number => {
		var rule = this._getRule(url, ua);

		return rule ? rule.lineNumber : -1;
	};

	/**
	 * Returns the opposite of isAllowed()
	 */
	isDisallowed = (url: string, ua: string) => {
		return !this.isAllowed(url, ua);
	};

	/**
	 * Gets the crawl delay if there is one.
	 *
	 * Will return undefined if there is no crawl delay set.
	 */
	getCrawlDelay = (ua: string): number | undefined => {
		var userAgent = this.formatUserAgent(ua || "*");

		return (this._rules[userAgent] || this._rules["*"] || {}).crawlDelay;
	};

	/**
	 * Returns the preferred host if there is one.
	 */
	getPreferredHost = () => {
		return this._preferredHost;
	};

	/**
	 * Returns an array of sitemap URLs if there are any.
	 *
	 * @return {Array.<string>}
	 */
	getSitemaps = () => {
		return this._sitemaps.slice(0);
	};

	/**
	 * Trims the white space from the start and end of the line.
	 *
	 * If the line is an array it will strip the white space from
	 * the start and end of each element of the array.
	 *
	 * @private
	 */
	private trimLine = (line: string | string[] | null): string[] | string | null => {
		if (line === null) {
			return null;
		}

		if (Array.isArray(line)) {
			return line.map((x) => {
				return x.trim();
			});
		}

		return String(line).trim();
	};

	/**
	 * Remove comments from lines
	 *
	 * @param {string} line
	 * @return {string}
	 * @private
	 */
	private removeComments(line: string): string {
		var commentStartIndex = line.indexOf("#");
		if (commentStartIndex > -1) {
			return line.substr(0, commentStartIndex);
		}

		return line;
	}

	/**
	 * Splits a line at the first occurrence of :
	 *
	 * @private
	 */
	private splitLine(line: string): string[] | null {
		var idx = String(line).indexOf(":");

		if (!line || idx < 0) {
			return null;
		}

		return [line.slice(0, idx), line.slice(idx + 1)];
	}

	/**
	 * Normalises the user-agent string by converting it to
	 * lower case and removing any version numbers.
	 *
	 * @private
	 */
	private formatUserAgent(userAgent: string): string {
		var formattedUserAgent = userAgent.toLowerCase();

		// Strip the version number from robot/1.0 user agents
		var idx = formattedUserAgent.indexOf("/");
		if (idx > -1) {
			formattedUserAgent = formattedUserAgent.substr(0, idx);
		}

		return formattedUserAgent.trim();
	}

	/**
	 * Normalises the URL encoding of a path by encoding
	 * unicode characters.
	 *
	 * @private
	 */
	private normaliseEncoding(path: string): string {
		try {
			return this.urlEncodeToUpper(encodeURI(path).replace(/%25/g, "%"));
		} catch (e) {
			return path;
		}
	}

	/**
	 * Convert URL encodings to support case.
	 *
	 * e.g.: %2a%ef becomes %2A%EF
	 *
	 * @private
	 */
	private urlEncodeToUpper(path: string): string {
		return path.replace(/%[0-9a-fA-F]{2}/g, function(match) {
			return match.toUpperCase();
		});
	}

	/**
	 * Converts the pattern into a regexp if it is a wildcard
	 * pattern.
	 *
	 * Returns a string if the pattern isn't a wildcard pattern
	 *
	 * @private
	 */
	private parsePattern(pattern: string): string | RegExp {
		var regexSpecialChars = /[\-\[\]\/\{\}\(\)\+\?\.\\\^\$\|]/g;
		// Treat consecutive wildcards as one (#12)
		var wildCardPattern = /\*+/g;
		var endOfLinePattern = /\\\$$/;

		pattern = this.normaliseEncoding(pattern);

		if (pattern.indexOf("*") < 0 && pattern.indexOf("$") < 0) {
			return pattern;
		}

		pattern = pattern
			.replace(regexSpecialChars, "\\$&")
			.replace(wildCardPattern, "(?:.*)")
			.replace(endOfLinePattern, "$");

		return new RegExp(pattern);
	}

	private parseRobots(contents: string) {
		var newlineRegex = /\r\n|\r|\n/;
		var lines = contents
			.split(newlineRegex)
			.map(this.removeComments)
			.map(this.splitLine)
			.map(this.trimLine);

		var currentUserAgents = [];
		var isNoneUserAgentState = true;
		for (var i = 0; i < lines.length; i++) {
			var line = lines[i];

			if (!line || !line[0]) {
				continue;
			}

			switch (line[0].toLowerCase()) {
				case "user-agent":
					if (isNoneUserAgentState) {
						currentUserAgents.length = 0;
					}

					if (line[1]) {
						currentUserAgents.push(this.formatUserAgent(line[1]));
					}
					break;

				case "disallow":
					this.addRule(currentUserAgents, line[1], false, i + 1);
					break;

				case "allow":
					this.addRule(currentUserAgents, line[1], true, i + 1);
					break;

				case "crawl-delay":
					this.setCrawlDelay(currentUserAgents, line[1]);
					break;

				case "sitemap":
					if (line[1]) {
						this.addSitemap(line[1]);
					}
					break;

				case "host":
					if (line[1]) {
						this.setPreferredHost(line[1].toLowerCase());
					}
					break;
			}

			isNoneUserAgentState = line[0].toLowerCase() !== "user-agent";
		}
	}

	/**
	 * Returns if a pattern is allowed by the specified rules.
	 *
	 * @param  {string}  path
	 * @param  {Array.<Object>}  rules
	 * @return {Object?}
	 * @private
	 */
	private findRule(path: string, rules: IRule[]) {
		var matchingRule = null;

		for (var i = 0; i < rules.length; i++) {
			var rule = rules[i];

			if (typeof rule.pattern === "string") {
				if (path.indexOf(rule.pattern) !== 0) {
					continue;
				}

				// The longest matching rule takes precedence
				if (!matchingRule || rule.pattern.length > (matchingRule.pattern as string).length) {
					matchingRule = rule;
				}
				// The first matching pattern takes precedence
				// over all other rules including other patterns
			} else if (rule.pattern.test(path)) {
				return rule;
			}
		}

		return matchingRule;
	}

	/**
	 * Converts provided string into an URL object.
	 *
	 * Will return null if provided string is not a valid URL.
	 *
	 * @private
	 */
	private parseUrl(url: string): URL | null {
		try {
			return new URL(url);
		} catch (e) {
			return null;
		}
	}
}

export default Robots;
