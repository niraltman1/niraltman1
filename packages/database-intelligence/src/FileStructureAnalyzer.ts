/**
 * FileStructureAnalyzer — analyzes folder hierarchy for migration concerns.
 * Read-only.
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { FileStructureMigrationReport, FolderNode } from './types.js';

const MAX_DEPTH = 10;

export class FileStructureAnalyzer {
  analyze(rootPath: string): FileStructureMigrationReport {
    if (!existsSync(rootPath)) {
      return {
        generatedAt:    new Date().toISOString(),
        rootPath,
        totalFolders:   0,
        maxDepth:       0,
        tree:           { name: basename(rootPath), path: rootPath, fileCount: 0, children: [] },
        namingIssues:   [`Folder not found: ${rootPath}`],
        migrationNotes: [],
      };
    }

    const namingIssues:   string[] = [];
    const migrationNotes: string[] = [];
    let totalFolders = 0;
    let maxDepth     = 0;

    const buildTree = (dir: string, depth: number): FolderNode => {
      totalFolders++;
      maxDepth = Math.max(maxDepth, depth);

      const name = basename(dir);
      this.checkNaming(name, dir, namingIssues);

      const node: FolderNode = { name, path: dir, fileCount: 0, children: [] };

      if (depth >= MAX_DEPTH) {
        migrationNotes.push(`Depth limit reached at: ${dir}`);
        return node;
      }

      let entries: string[];
      try { entries = readdirSync(dir); } catch { return node; }

      for (const entry of entries) {
        const full = join(dir, entry);
        try {
          const st = statSync(full);
          if (st.isDirectory()) {
            node.children.push(buildTree(full, depth + 1));
          } else if (st.isFile()) {
            node.fileCount++;
          }
        } catch { /* skip */ }
      }

      return node;
    };

    const tree = buildTree(rootPath, 0);

    if (maxDepth > 6) {
      migrationNotes.push(`Deep folder nesting (${maxDepth} levels) may complicate path normalization`);
    }
    if (totalFolders > 500) {
      migrationNotes.push(`Large folder count (${totalFolders}) — consider batch processing`);
    }

    return {
      generatedAt:  new Date().toISOString(),
      rootPath,
      totalFolders,
      maxDepth,
      tree,
      namingIssues,
      migrationNotes,
    };
  }

  private checkNaming(name: string, path: string, issues: string[]): void {
    // Hebrew characters in folder names can cause encoding issues on some systems
    if (/[֐-׿]/.test(name)) {
      issues.push(`Hebrew folder name may cause encoding issues: "${path}"`);
    }
    // Spaces in paths
    if (name.includes('  ')) {
      issues.push(`Double spaces in folder name: "${path}"`);
    }
    // Very long names
    if (name.length > 100) {
      issues.push(`Folder name exceeds 100 chars: "${path}"`);
    }
  }
}
