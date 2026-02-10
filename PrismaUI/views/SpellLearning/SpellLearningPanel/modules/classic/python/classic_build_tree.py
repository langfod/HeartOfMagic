#!/usr/bin/env python3
"""
Classic Growth — Tier-First Tree Builder

Builds spell trees where node depth strictly follows spell difficulty tier:
  Novice (depth 0) → Apprentice (depth 1) → Adept (depth 2) → Expert (depth 3) → Master (depth 4)

Within each tier, NLP theme similarity guides which parent a spell connects to,
so fire Apprentice spells link to fire Novice spells. But the tier ordering is
a hard constraint — a Novice spell can never be a child of a Master spell.

Output format matches the standard tree builder (build_tree.py) so the JS
layout, apply, and PRM systems work unchanged.

Reuses shared modules from SpellTreeBuilder/:
  - core.node (TreeNode, link_nodes)
  - theme_discovery (discover_themes_per_school, extract_spell_text)
  - config (TreeBuilderConfig)
  - validator (validate_tree, fix_unreachable_nodes, get_validation_summary)
"""

import json
import random
import sys
import traceback
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

# Shared modules live in SpellTreeBuilder/ — server.py adds it to sys.path
from core.node import TreeNode, link_nodes
from theme_discovery import extract_spell_text, discover_themes_per_school
from validator import validate_tree, get_validation_summary, fix_unreachable_nodes

# Log to SpellTreeBuilder's log directory
LOG_FILE = Path(__file__).resolve().parent.parent.parent.parent.parent.parent.parent / \
    "SKSE" / "Plugins" / "SpellLearning" / "SpellTreeBuilder" / "classic_build_tree.log"

TIER_ORDER = ['Novice', 'Apprentice', 'Adept', 'Expert', 'Master']
TIER_INDEX = {t: i for i, t in enumerate(TIER_ORDER)}


def _log(msg: str):
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(f"[{datetime.now().isoformat()}] {msg}\n")
    except Exception:
        pass


def classic_build_tree_from_data(spells: list, config_dict: dict) -> dict:
    """
    Build tier-ordered spell trees for Classic Growth mode.

    Args:
        spells: List of spell dicts with formId, name, school, skillLevel, etc.
        config_dict: Configuration dict from JS.

    Returns:
        dict: Tree data in standard format {schools: {name: {root, nodes, ...}}, ...}
    """
    config = dict(config_dict)

    # Seed setup
    if config.get('seed') is not None:
        used_seed = int(config['seed'])
    else:
        import time
        used_seed = int(time.time() * 1000) % 1000000
    random.seed(used_seed)
    config['seed'] = used_seed

    _log(f"classic_build_tree: seed={used_seed}, {len(spells)} spells")

    config.setdefault('max_children_per_node', 3)
    config.setdefault('top_themes_per_school', 8)
    config.setdefault('auto_fix_unreachable', True)
    config.setdefault('prefer_vanilla_roots', True)

    # Group spells by school
    school_spells: Dict[str, List[dict]] = defaultdict(list)
    for spell in spells:
        school = spell.get('school', 'Unknown')
        if not school or school in ('null', 'undefined', 'None', ''):
            school = 'Hedge Wizard'
        school_spells[school].append(spell)

    # Discover themes per school for NLP-guided parent matching
    try:
        themes_per_school = discover_themes_per_school(
            spells,
            top_n=config.get('top_themes_per_school', 8),
            fallback=True
        )
    except Exception as e:
        _log(f"Theme discovery failed: {e}")
        themes_per_school = {}

    # Build NLP similarity data for parent matching
    nlp_data = _build_nlp_data(spells)

    # Build each school's tree
    tree_data = {'version': '1.0', 'schools': {}}
    max_children = config['max_children_per_node']

    for school_name, school_spell_list in school_spells.items():
        _log(f"Building {school_name}: {len(school_spell_list)} spells")

        school_themes = themes_per_school.get(school_name, [])
        result = _build_school_tree(
            school_spell_list, school_name, school_themes,
            nlp_data, max_children, config
        )
        if result:
            tree_data['schools'][school_name] = result
            _log(f"  {school_name}: {len(result['nodes'])} nodes, root={result['root']}")

    # Metadata
    tree_data['generatedAt'] = datetime.now().isoformat()
    tree_data['generator'] = 'ClassicTreeBuilder (Tier-First)'
    tree_data['config'] = {
        'shape': 'tier_first',
        'density': config.get('density', 0.6),
        'symmetry': config.get('symmetry', 0.3),
    }
    tree_data['seed'] = used_seed

    # Validate and auto-fix
    validation = validate_tree(tree_data, max_children)
    summary = get_validation_summary(validation)

    if summary['total_errors'] > 0 and config.get('auto_fix_unreachable', True):
        total_fixes = 0
        for sn, sd in tree_data.get('schools', {}).items():
            nodes_list = sd.get('nodes', [])
            nodes_dict = {n['formId']: n for n in nodes_list}
            root_id = sd.get('root')
            if root_id:
                fixes = fix_unreachable_nodes(nodes_dict, root_id, max_children)
                if fixes > 0:
                    total_fixes += fixes
                    sd['nodes'] = list(nodes_dict.values())
        if total_fixes > 0:
            validation = validate_tree(tree_data, max_children)
            summary = get_validation_summary(validation)

    tree_data['validation'] = {
        'all_valid': summary['all_valid'],
        'total_nodes': summary['total_nodes'],
        'reachable_nodes': summary['reachable_nodes'],
    }

    _log(f"classic_build_tree complete: {summary['total_nodes']} nodes, valid={summary['all_valid']}")
    return tree_data


def _build_school_tree(
    spells: List[dict],
    school_name: str,
    themes: List[str],
    nlp_data: dict,
    max_children: int,
    config: dict
) -> Optional[dict]:
    """Build one school's tier-ordered tree."""

    if not spells:
        return None

    # Group spells by tier
    by_tier: Dict[str, List[dict]] = {t: [] for t in TIER_ORDER}
    unknown_tier: List[dict] = []

    for spell in spells:
        tier = spell.get('skillLevel', '')
        if tier in TIER_INDEX:
            by_tier[tier].append(spell)
        else:
            unknown_tier.append(spell)

    # Assign unknown-tier spells to Novice (safest default)
    by_tier['Novice'].extend(unknown_tier)

    # Find root: prefer vanilla root from lowest tier with spells
    root_spell = _pick_root(by_tier, config)
    if not root_spell:
        return None

    # Create all nodes
    nodes: Dict[str, TreeNode] = {}
    for spell in spells:
        node = TreeNode.from_spell(spell)
        nodes[node.form_id] = node

    # Also add any unknown-tier spells that came from the extension above
    for spell in unknown_tier:
        fid = spell.get('formId', '')
        if fid and fid not in nodes:
            nodes[fid] = TreeNode.from_spell(spell)

    root = nodes[root_spell['formId']]
    root.is_root = True
    root.depth = 0

    # Assign themes to nodes using NLP text matching
    _assign_themes(nodes, spells, themes)

    # Build tree tier-by-tier
    connected = {root.form_id}
    # Track which nodes are available as parents (have capacity)
    available: Dict[int, List[TreeNode]] = defaultdict(list)
    available[0].append(root)

    for tier_idx, tier_name in enumerate(TIER_ORDER):
        tier_spells = by_tier[tier_name]

        # Skip root spell (already placed)
        tier_spells = [s for s in tier_spells if s['formId'] != root.form_id]

        if not tier_spells:
            continue

        # Shuffle for variety, but sort by theme affinity to spread evenly
        random.shuffle(tier_spells)

        placed_this_tier = []

        for spell in tier_spells:
            fid = spell['formId']
            if fid in connected:
                continue

            node = nodes.get(fid)
            if not node:
                continue

            # Find best parent from available nodes at LOWER tiers
            parent = _find_best_parent(
                node, available, tier_idx, max_children, nlp_data, themes
            )

            if parent:
                link_nodes(parent, node)
                # Override depth to match tier index (link_nodes sets parent.depth + 1)
                node.depth = tier_idx
                connected.add(fid)
                placed_this_tier.append(node)

                # Update parent availability
                if len(parent.children) >= max_children:
                    # Remove from available
                    for d in list(available.keys()):
                        available[d] = [p for p in available[d] if p.form_id != parent.form_id]

        # Add this tier's placed nodes as available parents for next tier
        for placed_node in placed_this_tier:
            if len(placed_node.children) < max_children:
                available[tier_idx].append(placed_node)

        _log(f"  {school_name} tier {tier_name}: {len(placed_this_tier)}/{len(tier_spells)} placed")

    # Force-connect any remaining unconnected nodes
    unconnected = [fid for fid in nodes if fid not in connected]
    if unconnected:
        _log(f"  {school_name}: {len(unconnected)} unconnected, force-attaching")
        _force_connect(unconnected, nodes, connected, available, max_children)

    # Serialize
    node_dicts = [n.to_dict() for n in nodes.values()]

    return {
        'root': root.form_id,
        'layoutStyle': 'tier_first',
        'nodes': node_dicts,
        'config_used': {
            'shape': 'tier_first',
            'density': config.get('density', 0.6),
            'symmetry': config.get('symmetry', 0.3),
            'source': 'classic'
        }
    }


def _pick_root(by_tier: Dict[str, List[dict]], config: dict) -> Optional[dict]:
    """Pick the best root spell from the lowest available tier."""
    prefer_vanilla = config.get('prefer_vanilla_roots', True)

    for tier_name in TIER_ORDER:
        tier_spells = by_tier[tier_name]
        if not tier_spells:
            continue

        if prefer_vanilla:
            # Vanilla formIds are typically < 0x01000000 (no mod prefix)
            vanilla = [s for s in tier_spells if _is_vanilla(s.get('formId', ''))]
            if vanilla:
                return random.choice(vanilla)

        return random.choice(tier_spells)

    return None


def _is_vanilla(form_id: str) -> bool:
    """Check if a formId is likely vanilla (low load order)."""
    try:
        val = int(form_id, 16) if isinstance(form_id, str) else int(form_id)
        return (val >> 24) < 0x05  # First 5 load order slots
    except (ValueError, TypeError):
        return False


def _assign_themes(nodes: Dict[str, TreeNode], spells: List[dict], themes: List[str]):
    """Assign theme tags to nodes based on spell text matching."""
    if not themes:
        return

    for spell in spells:
        fid = spell.get('formId', '')
        node = nodes.get(fid)
        if not node:
            continue

        text = extract_spell_text(spell).lower()
        best_theme = None
        best_count = 0

        for theme in themes:
            # Count theme keyword occurrences in spell text
            count = text.count(theme.lower())
            if count > best_count:
                best_count = count
                best_theme = theme

        if best_theme:
            node.theme = best_theme


def _build_nlp_data(spells: List[dict]) -> dict:
    """Build spell text data for NLP similarity matching."""
    texts = {}
    for spell in spells:
        fid = spell.get('formId', '')
        texts[fid] = extract_spell_text(spell).lower()
    return {'texts': texts}


def _text_similarity(text_a: str, text_b: str) -> float:
    """Simple word overlap similarity (no sklearn needed)."""
    if not text_a or not text_b:
        return 0.0

    words_a = set(text_a.split())
    words_b = set(text_b.split())

    if not words_a or not words_b:
        return 0.0

    intersection = words_a & words_b
    union = words_a | words_b

    return len(intersection) / len(union) if union else 0.0


def _find_best_parent(
    node: TreeNode,
    available: Dict[int, List[TreeNode]],
    tier_idx: int,
    max_children: int,
    nlp_data: dict,
    themes: List[str]
) -> Optional[TreeNode]:
    """Find the best parent for a node from available parents at lower tiers."""

    # Collect candidates: parents from LOWER tiers, and same tier if tier_idx == 0
    candidates = []
    for d in range(max(0, tier_idx - 1), tier_idx):
        candidates.extend(available.get(d, []))

    # Also allow same-tier parents if no lower-tier candidates
    if not candidates and tier_idx > 0:
        # Try all lower tiers
        for d in range(0, tier_idx):
            candidates.extend(available.get(d, []))

    # Last resort: any available parent
    if not candidates:
        for d in sorted(available.keys()):
            candidates.extend(available.get(d, []))

    if not candidates:
        return None

    # Filter by capacity
    candidates = [c for c in candidates if len(c.children) < max_children]
    if not candidates:
        # Expand capacity as last resort
        for d in sorted(available.keys()):
            for p in available.get(d, []):
                if len(p.children) < max_children + 2:
                    candidates.append(p)
        if not candidates:
            return None

    # Score candidates
    node_text = nlp_data['texts'].get(node.form_id, '')
    scored = []

    for candidate in candidates:
        score = 0.0

        # Theme match: strong bonus for same theme
        if node.theme and candidate.theme:
            if node.theme == candidate.theme:
                score += 10.0
            else:
                score -= 2.0

        # NLP text similarity
        cand_text = nlp_data['texts'].get(candidate.form_id, '')
        sim = _text_similarity(node_text, cand_text)
        score += sim * 5.0

        # Prefer parents with fewer children (balance the tree)
        child_count = len(candidate.children)
        score -= child_count * 1.5

        # Slight preference for parents at depth = tier_idx - 1 (immediate predecessor)
        if candidate.depth == tier_idx - 1:
            score += 2.0
        elif candidate.depth == tier_idx - 2:
            score += 1.0

        # Small random jitter for variety
        score += random.uniform(-0.5, 0.5)

        scored.append((score, candidate))

    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1]


def _force_connect(
    unconnected: List[str],
    nodes: Dict[str, TreeNode],
    connected: set,
    available: Dict[int, List[TreeNode]],
    max_children: int
):
    """Force-connect remaining unconnected nodes to any available parent."""
    for fid in unconnected:
        node = nodes.get(fid)
        if not node or fid in connected:
            continue

        # Find least-loaded connected node
        best_parent = None
        best_load = float('inf')

        for cid in connected:
            cnode = nodes.get(cid)
            if cnode and len(cnode.children) < best_load:
                best_load = len(cnode.children)
                best_parent = cnode

        if best_parent:
            link_nodes(best_parent, node)
            # Set depth based on tier
            tier_idx = TIER_INDEX.get(node.tier, 0)
            node.depth = tier_idx
            connected.add(fid)

            if len(node.children) < max_children:
                available.setdefault(tier_idx, []).append(node)
