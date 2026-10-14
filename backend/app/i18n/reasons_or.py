"""Odia learner-facing reason messages — shipped, not LLM-generated."""
REASON_MESSAGES = {
    "target.unstarted_no_prereqs_needed": "ନୂଆ ଧାରଣା ଆରମ୍ଭ କରିବା।",
    "target.prerequisite_unstarted": "ପ୍ରଥମ ଆଧାର ଧାରଣା ଶିଖ।",
    "target.prerequisite_not_mastered": "ପ୍ରଥମ ଆଧାର ଧାରଣା ବଦ୍ଧ କର।",
    "target.first_unmastered_with_prereqs": "ଏହି ଧାରଣା ଉପରେ କାମ କର।",
    "target.fallback_first_concept": "ପ୍ରଥମ ଧାରଣା ଆରମ୍ଭ କର।",
    "target.lowest_mastery_fallback": "ସବୁଠା ଦୁର୍ବଳ ଧାରଣା ଉପରେ ମନ୍ଦନ କର।",
    "action.remediate_low_mastery_or_incorrect": "ଆଜି ଉତ୍ତର ଭୁଲ ଥିଲା। ପୁଣି ଶିଖ।",
    "action.retry_below_threshold": "ଆଉକି ଚେଷ୍ଟା କର।",
    "action.revise_below_threshold": "ପୁଣି ରିଭିଜନ୍ କର।",
    "action.revise_safe_default": "ପୁଣି ରିଭିଜନ୍ କର।",
    "action.advance_mastered": "ସାବଧାନ! ପରବର୍ତ୍ତୀ ଧାରଣା କୁ ଯାଅ।",
    "guard.escape_to_revise_not_ready_to_advance": "ବାରମ୍ବାର ଉନ୍ନତି ପାଇﬁ ରିଭିଜନ୍ କର।",
    "guard.escape_action": "ପୁଣି ରିଭିଜନ୍ କର।",
    "guard.escape_loop_on_same_concept": "ଏହି ଧାରଣା କୁ ବାରମ୍ବାର ବଦ୍ଧ କର।",
    "guard.no_override": "ଆଗାମୀ କାମ ଜାରି ରଖ।",
    "content.out_of_lessons": "ଏହି ପ୍ରଶ୍ନ ଆମ ପାଠ୍ୟକ୍ରମ ବାହାରେ। ସାମ୍ନାରେ ଥିବା ଧାରଣା ପଢ।",
    "translation.unavailable": "ଅନୁବାଦ ସେବା ଅନୁପଲବ୍ଧ। ମୂଳ ଓଡ଼ିଆ ପ୍ରଶ୍ନ ସହ ପାଠ ଖୋଜାଯାଉ।",
    "generation.basic_answer": "ଆମ ଉତ୍ତର ପାଠ୍ୟରୁ।",
}

__all__ = ["REASON_MESSAGES"]
