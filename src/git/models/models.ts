'use strict';

import { Container } from '../../container';
import { GlyphChars } from '../../constants';

// import { Git } from '../git';

const emptyStr = '';

const shaLikeRegex = /(^[0-9a-f]{40}([\^@~:]\S*)?$)|(^[0]{40}(:|-)$)/;
const shaRegex = /(^[0-9a-f]{40}$)|(^[0]{40}(:|-)$)/;
const shaParentRegex = /(^[0-9a-f]{40})\^[0-3]?$/;
const shaShortenRegex = /^(.*?)([\^@~:].*)?$/;
const uncommittedRegex = /^[0]{40}(?:[\^@~:]\S*)?:?$/;
const uncommittedStagedRegex = /^[0]{40}([\^@~]\S*)?:$/;

function isMatch(regex: RegExp, ref: string | undefined) {
	return ref == null || ref.length === 0 ? false : regex.test(ref);
}

export namespace GitRevision {
	export const deletedOrMissing = '0000000000000000000000000000000000000000-';
	export const uncommitted = '0000000000000000000000000000000000000000';
	export const uncommittedStaged = '0000000000000000000000000000000000000000:';

	export function createRange(
		ref1: string | undefined,
		ref2: string | undefined,
		notation: '..' | '...' = '..',
	): string {
		return `${ref1 || ''}${notation}${ref2 || ''}`;
	}

	export function isDottedRangeNotation(ref: string | undefined) {
		return ref?.includes('..') ?? false;
	}

	export function isSha(ref: string) {
		return isMatch(shaRegex, ref);
	}

	export function isShaLike(ref: string) {
		return isMatch(shaLikeRegex, ref);
	}

	export function isShaParent(ref: string) {
		return isMatch(shaParentRegex, ref);
	}

	export function isUncommitted(ref: string | undefined) {
		return isMatch(uncommittedRegex, ref);
	}

	export function isUncommittedStaged(ref: string | undefined): boolean {
		return isMatch(uncommittedStagedRegex, ref);
	}

	export function shorten(
		ref: string | undefined,
		{
			force,
			strings = {},
		}: {
			force?: boolean;
			strings?: { uncommitted?: string; uncommittedStaged?: string; working?: string };
		} = {},
	) {
		if (ref === deletedOrMissing) return '(deleted)';

		if (ref == null || ref.length === 0) return strings.working || emptyStr;
		if (isUncommitted(ref)) {
			return isUncommittedStaged(ref)
				? strings.uncommittedStaged || 'Index'
				: strings.uncommitted || 'Working Tree';
		}

		if (!force && !isShaLike(ref)) return ref;

		// Don't allow shas to be shortened to less than 5 characters
		const len = Math.max(5, Container.config.advanced.abbreviatedShaLength);

		// If we have a suffix, append it
		const match = shaShortenRegex.exec(ref);
		if (match != null) {
			const [, rev, suffix] = match;

			if (suffix != null) {
				return `${rev.substr(0, len)}${suffix}`;
			}
		}

		return ref.substr(0, len);
	}
}

export interface GitBranchReference {
	readonly refType: 'branch';
	name: string;
	ref: string;
	readonly remote: boolean;
	repoPath: string;
}

export interface GitRevisionReference {
	readonly refType: 'revision';
	name: string;
	ref: string;
	repoPath: string;

	message?: string;
}

export interface GitStashReference {
	readonly refType: 'revision';
	name: string;
	ref: string;
	repoPath: string;
	// stashName: string;
	number: string | undefined;

	message?: string;
}

export interface GitTagReference {
	readonly refType: 'tag';
	name: string;
	ref: string;
	repoPath: string;
}

export type GitReference = GitBranchReference | GitRevisionReference | GitStashReference | GitTagReference;

export namespace GitReference {
	export function create(
		ref: string,
		repoPath: string,
		options: { refType: 'branch'; name: string; remote: boolean },
	): GitBranchReference;
	export function create(
		ref: string,
		repoPath: string,
		options?: { refType: 'revision'; name?: string; message?: string },
	): GitRevisionReference;
	export function create(
		ref: string,
		repoPath: string,
		options: { refType: 'stash'; name: string; number: string | undefined; message?: string },
	): GitStashReference;
	export function create(ref: string, repoPath: string, options: { refType: 'tag'; name: string }): GitTagReference;
	export function create(
		ref: string,
		repoPath: string,
		options:
			| { refType: 'branch'; name: string; remote: boolean }
			| { refType?: 'revision'; name?: string; message?: string }
			| { refType: 'stash'; name: string; number: string | undefined; message?: string }
			| { refType: 'tag'; name: string } = { refType: 'revision' },
	): GitReference {
		switch (options.refType) {
			case 'branch':
				return {
					name: options.name,
					ref: ref,
					refType: 'branch',
					remote: options.remote,
					repoPath: repoPath,
				};
			case 'stash':
				return {
					name: options.name,
					ref: ref,
					refType: 'revision',
					repoPath: repoPath,
					number: options.number,
					message: options.message,
				};
			case 'tag':
				return {
					name: options.name,
					ref: ref,
					refType: 'tag',
					repoPath: repoPath,
				};
			default:
				return {
					name: options.name ?? GitRevision.shorten(ref, { force: true }),
					ref: ref,
					refType: 'revision',
					repoPath: repoPath,
					message: options.message,
				};
		}
	}

	export function getNameWithoutRemote(ref: GitReference) {
		if (ref.refType === 'branch') {
			return ref.remote ? ref.name.substring(ref.name.indexOf('/') + 1) : ref.name;
		}
		return ref.name;
	}

	export function isBranch(ref: GitReference | undefined): ref is GitBranchReference {
		return ref?.refType === 'branch';
	}

	export function isRevision(ref: GitReference | undefined): ref is GitRevisionReference {
		return ref?.refType === 'revision';
	}

	export function isStash(ref: GitReference | undefined): ref is GitStashReference {
		return ref?.refType === 'revision' && (ref as any)?.stashName;
	}

	export function isTag(ref: GitReference | undefined): ref is GitTagReference {
		return ref?.refType === 'tag';
	}

	export function toString(
		refs: GitReference | GitReference[] | undefined,
		options?: { capitalize?: boolean; expand?: boolean; icon?: boolean } | false,
	) {
		if (refs == null) return '';

		options = options === false ? {} : { expand: true, icon: true, ...options };

		let result;
		if (!Array.isArray(refs) || refs.length === 1) {
			const ref = Array.isArray(refs) ? refs[0] : refs;
			switch (ref.refType) {
				case 'branch':
					result = `${options.expand ? `${ref.remote ? 'remote ' : ''}branch ` : ''}${
						options.icon ? `$(git-branch) ${ref.name}${GlyphChars.Space}` : ref.name
					}`;
					break;
				case 'tag':
					result = `${options.expand ? 'tag ' : ''}${
						options.icon ? `$(tag) ${ref.name}${GlyphChars.Space}` : ref.name
					}`;
					break;
				default: {
					if (GitReference.isStash(ref)) {
						let message;
						if (options.expand && ref.message) {
							message = `${ref.number != null ? `${ref.number}: ` : ''}${
								ref.message.length > 20
									? `${ref.message.substring(0, 20).trimRight()}${GlyphChars.Ellipsis}`
									: ref.message
							}`;
						}

						result = `${options.expand ? 'stash ' : ''}${
							options.icon
								? `$(archive) ${message ?? ref.name}${GlyphChars.Space}`
								: `${message ?? ref.number ?? ref.name}`
						}`;
					} else {
						let message;
						if (options.expand && ref.message) {
							message =
								ref.message.length > 20
									? ` (${ref.message.substring(0, 20).trimRight()}${GlyphChars.Ellipsis})`
									: ` (${ref.message})`;
						}

						result = `${options.expand ? 'commit ' : ''}${
							options.icon
								? `$(git-commit) ${ref.name}${message ?? ''}${GlyphChars.Space}`
								: `${ref.name}${message ?? ''}`
						}`;
					}
					break;
				}
			}

			return options.capitalize && options.expand
				? `${result[0].toLocaleUpperCase()}${result.substring(1)}`
				: result;
		}

		const expanded = options.expand ? ` (${refs.map(r => r.name).join(', ')})` : '';
		switch (refs[0].refType) {
			case 'branch':
				return `${refs.length} branches${expanded}`;
			case 'tag':
				return `${refs.length} tags${expanded}`;
			default:
				return `${refs.length} ${GitReference.isStash(refs[0]) ? 'stashes' : 'commits'}${expanded}`;
		}
	}
}

export * from './blame';
export * from './blameCommit';
export * from './branch';
export * from './commit';
export * from './contributor';
export * from './diff';
export * from './file';
export * from './issue';
export * from './log';
export * from './logCommit';
export * from './pullRequest';
export * from './remote';
export * from './repository';
export * from './reflog';
export * from './shortlog';
export * from './stash';
export * from './stashCommit';
export * from './status';
export * from './tag';
export * from './tree';
